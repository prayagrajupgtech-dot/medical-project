/**
 * Document Ingestion Pipeline
 * Handles: text extraction → cleaning → chunking → metadata → embedding → indexing
 */

const { db } = require('../database/config');
const embeddingService = require('./embedding-service');

// ── Configuration ──────────────────────────────────────────────────────────────
const CHUNK_SIZE = 400;       // words per chunk
const CHUNK_OVERLAP = 80;     // word overlap between chunks
const MIN_CHUNK_SIZE = 50;    // minimum words to keep a chunk

// ── Text Cleaning ──────────────────────────────────────────────────────────────

function cleanText(text) {
    if (!text || typeof text !== 'string') return '';
    return text
        .replace(/\r\n/g, '\n')
        .replace(/\t/g, ' ')
        .replace(/ +/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// ── Section Detection ──────────────────────────────────────────────────────────

function detectSections(text) {
    const sectionPatterns = [
        /^(?:#{1,4})\s+(.+)$/gm,                           // Markdown headers
        /^([A-Z][A-Z\s\-:]{3,60})$/gm,                    // ALL CAPS headers
        /^(\d+\.?\d*)\s+([A-Z][A-Za-z\s\-:]{3,60})$/gm,  // Numbered sections
        /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*):$/gm,           // Title Case with colon
    ];

    const sections = [];
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        for (const pattern of sectionPatterns) {
            pattern.lastIndex = 0;
            const match = pattern.exec(line);
            if (match) {
                sections.push({
                    title: (match[1] || match[0]).trim(),
                    lineNumber: i,
                    level: line.startsWith('##') ? 2 : line.startsWith('#') ? 1 : 0
                });
                break;
            }
        }
    }

    return sections;
}

// ── Chunking ───────────────────────────────────────────────────────────────────

function chunkText(text, sections) {
    const chunks = [];
    const lines = text.split('\n');
    let currentSection = '';
    let currentChapter = '';
    let buffer = [];
    let wordCount = 0;

    function flushChunk() {
        if (buffer.length === 0) return;
        const content = buffer.join('\n').trim();
        const wc = content.split(/\s+/).length;
        if (wc >= MIN_CHUNK_SIZE) {
            chunks.push({
                content,
                word_count: wc,
                section: currentSection,
                chapter: currentChapter
            });
        }
        // Keep overlap
        const overlapLines = [];
        let overlapWords = 0;
        for (let i = buffer.length - 1; i >= 0 && overlapWords < CHUNK_OVERLAP; i--) {
            overlapLines.unshift(buffer[i]);
            overlapWords += buffer[i].split(/\s+/).length;
        }
        buffer = overlapLines;
        wordCount = overlapWords;
    }

    let sectionIdx = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Check if we hit a section header
        while (sectionIdx < sections.length && sections[sectionIdx].lineNumber <= i) {
            const sec = sections[sectionIdx];
            if (sec.level <= 1) {
                currentChapter = sec.title;
            }
            currentSection = sec.title;
            sectionIdx++;
        }

        buffer.push(line);
        wordCount += line.split(/\s+/).length;

        if (wordCount >= CHUNK_SIZE) {
            flushChunk();
        }
    }

    // Final chunk
    flushChunk();

    return chunks;
}

// ── Metadata Extraction ────────────────────────────────────────────────────────

function extractMetadata(content, sourceInfo) {
    const keywords = embeddingService.extractKeywords(content);
    const topics = embeddingService.detectMedicalTopics(content);
    const specialty = embeddingService.classifySpecialty(content);

    return {
        keywords: keywords.join(','),
        medical_topic: topics[0] || 'general_medicine',
        specialty,
        topics
    };
}

// ── Ingestion Pipeline ─────────────────────────────────────────────────────────

/**
 * Ingest a document into the knowledge base
 * @param {number} sourceId - Source ID
 * @param {string} title - Document title
 * @param {string} content - Full text content
 * @param {object} options - { chapter, section, pageStart, pageEnd, filePath }
 * @returns {object} Ingestion result
 */
async function ingestDocument(sourceId, title, content, options = {}) {
    const cleaned = cleanText(content);
    if (!cleaned) {
        throw new Error('Document content is empty after cleaning');
    }

    const wordCount = cleaned.split(/\s+/).length;

    // Insert document record
    const docResult = await new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO medical_documents (source_id, title, chapter, section, page_start, page_end, file_path, content, word_count, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing')`,
            [sourceId, title, options.chapter || null, options.section || null,
             options.pageStart || null, options.pageEnd || null, options.filePath || null,
             cleaned, wordCount],
            function(err) { err ? reject(err) : resolve({ id: this.lastID }); }
        );
    });

    const documentId = docResult.id;

    try {
        // Detect sections
        const sections = detectSections(cleaned);

        // Chunk the text
        const rawChunks = chunkText(cleaned, sections);

        // Process each chunk
        let chunkIndex = 0;
        for (const rawChunk of rawChunks) {
            const metadata = extractMetadata(rawChunk.content, {});
            const embedding = embeddingService.generateEmbedding(rawChunk.content);

            await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO medical_chunks (document_id, source_id, chunk_index, title, chapter, section, page_number, content, word_count, medical_topic, specialty, keywords, embedding)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        documentId, sourceId, chunkIndex,
                        title, rawChunk.chapter || options.chapter || null,
                        rawChunk.section || options.section || null,
                        options.pageStart || null,
                        rawChunk.content, rawChunk.word_count,
                        metadata.medical_topic, metadata.specialty,
                        metadata.keywords, embedding
                    ],
                    function(err) { err ? reject(err) : resolve(); }
                );
            });

            chunkIndex++;
        }

        // Update document status
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE medical_documents SET status = 'indexed', chunk_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [chunkIndex, documentId],
                (err) => err ? reject(err) : resolve()
            );
        });

        // Update source total chunks
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE medical_sources SET total_chunks = total_chunks + ?, indexed_at = CURRENT_TIMESTAMP, status = 'indexed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [chunkIndex, sourceId],
                (err) => err ? reject(err) : resolve()
            );
        });

        return {
            documentId,
            chunkCount: chunkIndex,
            wordCount,
            title
        };
    } catch (err) {
        // Mark document as failed
        await new Promise((resolve) => {
            db.run(
                `UPDATE medical_documents SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [err.message, documentId],
                () => resolve()
            );
        });
        throw err;
    }
}

/**
 * Ingest a text source (paste text content)
 */
async function ingestTextSource(sourceId, title, text, options = {}) {
    return ingestDocument(sourceId, title, text, options);
}

/**
 * Re-index all chunks for a source (regenerate embeddings)
 */
async function reindexSource(sourceId) {
    const chunks = await new Promise((resolve, reject) => {
        db.all('SELECT id, content FROM medical_chunks WHERE source_id = ?', [sourceId], (err, rows) => {
            err ? reject(err) : resolve(rows || []);
        });
    });

    let updated = 0;
    for (const chunk of chunks) {
        const embedding = embeddingService.generateEmbedding(chunk.content);
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE medical_chunks SET embedding = ? WHERE id = ?',
                [embedding, chunk.id],
                (err) => err ? reject(err) : resolve()
            );
        });
        updated++;
    }

    await new Promise((resolve, reject) => {
        db.run(
            `UPDATE medical_sources SET indexed_at = CURRENT_TIMESTAMP, status = 'indexed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [sourceId],
            (err) => err ? reject(err) : resolve()
        );
    });

    return { updated, total: chunks.length };
}

/**
 * Delete a source and all its documents/chunks
 */
async function deleteSource(sourceId) {
    await new Promise((resolve, reject) => {
        db.run('DELETE FROM medical_sources WHERE id = ?', [sourceId], (err) => err ? reject(err) : resolve());
    });
    // CASCADE should handle documents and chunks, but let's be safe
    await new Promise((resolve, reject) => {
        db.run('DELETE FROM medical_documents WHERE source_id = ?', [sourceId], (err) => err ? reject(err) : resolve());
    });
    await new Promise((resolve, reject) => {
        db.run('DELETE FROM medical_chunks WHERE source_id = ?', [sourceId], (err) => err ? reject(err) : resolve());
    });
    return { deleted: true };
}

module.exports = {
    ingestDocument,
    ingestTextSource,
    reindexSource,
    deleteSource,
    cleanText,
    detectSections,
    chunkText
};
