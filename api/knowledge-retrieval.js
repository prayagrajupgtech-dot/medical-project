/**
 * Medical Knowledge Retrieval Service
 * Handles: search → relevance ranking → evidence validation → source citation
 */

const { db } = require('../database/config');
const embeddingService = require('./embedding-service');

// ── Configuration ──────────────────────────────────────────────────────────────
const TOP_K_RESULTS = 10;
const MIN_SIMILARITY = 0.05;
const MAX_RESULTS_PER_SOURCE = 3;

// ── Knowledge Search ───────────────────────────────────────────────────────────

/**
 * Search medical knowledge base using vector similarity + keyword matching
 * @param {string} query - User's medical question
 * @param {object} options - { limit, topic, specialty, sourceType }
 * @returns {object} { chunks, sources, query }
 */
async function searchKnowledge(query, options = {}) {
    const limit = options.limit || TOP_K_RESULTS;
    const queryEmbedding = embeddingService.generateEmbedding(query);
    const queryTopics = embeddingService.detectMedicalTopics(query);
    const queryKeywords = embeddingService.extractKeywords(query);

    // Fetch all chunks with embeddings (for small-medium KB; for large KB, use topic pre-filter)
    let sql = `SELECT c.*, s.source_name, s.source_type, s.author, s.publisher, s.year, s.url, s.license
               FROM medical_chunks c
               JOIN medical_sources s ON c.source_id = s.id
               WHERE s.status = 'indexed' AND c.embedding IS NOT NULL`;

    const params = [];

    // Optional pre-filter by topic
    if (options.topic) {
        sql += ` AND c.medical_topic = ?`;
        params.push(options.topic);
    }
    if (options.specialty) {
        sql += ` AND c.specialty = ?`;
        params.push(options.specialty);
    }
    if (options.sourceType) {
        sql += ` AND s.source_type = ?`;
        params.push(options.sourceType);
    }

    const allChunks = await new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
    });

    if (allChunks.length === 0) {
        return { chunks: [], sources: [], query, topics: queryTopics };
    }

    // Score each chunk
    const scored = allChunks.map(chunk => {
        const lowerContent = (chunk.content || '').toLowerCase();
        const lowerQuery = query.toLowerCase();
        const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 2);
        const titleLower = (chunk.title || '').toLowerCase();
        const chapterLower = (chunk.chapter || '').toLowerCase();

        // Fuzzy word match: check if query word matches title word (stem-like)
        function fuzzyMatch(queryWord, targetWord) {
            if (targetWord.includes(queryWord) || queryWord.includes(targetWord)) return true;
            // Simple stem: remove common suffixes
            const stems = ['tion','sion','ment','ness','ous','ive','ing','ally','ity','ence','ance','ical','ual'];
            let qw = queryWord, tw = targetWord;
            for (const s of stems) {
                if (qw.endsWith(s) && qw.length > 4) qw = qw.slice(0, -s.length);
                if (tw.endsWith(s) && tw.length > 4) tw = tw.slice(0, -s.length);
            }
            return qw === tw || tw.includes(qw) || qw.includes(tw);
        }

        // ── 1. Title exact match (highest signal) ──
        let titleScore = 0;
        const queryBigrams = [];
        for (let i = 0; i < queryWords.length; i++) {
            // Check each title word for fuzzy match
            const titleWords = titleLower.split(/\s+/);
            for (const tw of titleWords) {
                if (fuzzyMatch(queryWords[i], tw)) {
                    titleScore += 0.3;
                    break;
                }
            }
            for (let j = i + 1; j < queryWords.length; j++) {
                queryBigrams.push(queryWords[i] + ' ' + queryWords[j]);
            }
        }
        for (const bg of queryBigrams) {
            if (titleLower.includes(bg)) titleScore += 0.4;
        }

        // ── 2. Topic keyword in title/chapter (strong signal) ──
        let topicTitleBonus = 0;
        const topicKeywords = {
            'headache': ['headache', 'migraine', 'head'],
            'chest pain': ['chest', 'cardiac', 'heart'],
            'diabetes': ['diabetes', 'blood sugar', 'glucose'],
            'hypertension': ['blood pressure', 'hypertension', 'dASH'],
            'anxiety': ['anxiety', 'anxious', 'panic', 'worry', 'worried'],
            'depression': ['depression', 'depressed', 'mood'],
            'fever': ['fever', 'temperature', 'pyrexia'],
            'burn': ['burn', 'first aid', 'scald'],
            'cough': ['cough', 'respiratory'],
            'abdominal': ['abdominal', 'stomach', 'belly'],
            'fatigue': ['fatigue', 'tired', 'weakness'],
            'dizziness': ['dizziness', 'vertigo', 'dizzy'],
            'lab test': ['lab test', 'blood test', 'hemoglobin', 'interpretation'],
            'medication': ['medication', 'drug', 'side effect', 'aspirin'],
            'stroke': ['stroke', 'emergency', 'neurological']
        };
        for (const [topic, keywords] of Object.entries(topicKeywords)) {
            if (lowerQuery.includes(topic)) {
                for (const kw of keywords) {
                    if (titleLower.includes(kw) || chapterLower.includes(kw)) {
                        topicTitleBonus += 0.3;
                    }
                }
            }
        }

        // ── 3. Vector similarity ──
        const vectorSim = embeddingService.cosineSimilarity(queryEmbedding, chunk.embedding);

        // ── 4. Keyword overlap ──
        const chunkKeywords = (chunk.keywords || '').split(',').filter(Boolean);
        let keywordScore = 0;
        for (const kw of queryKeywords) {
            if (chunkKeywords.includes(kw)) keywordScore += 0.1;
        }

        // ── 5. Direct text matching ──
        let textMatchScore = 0;
        let matchedWords = 0;
        for (const word of queryWords) {
            if (lowerContent.includes(word)) {
                textMatchScore += 0.05;
                matchedWords++;
            }
        }
        const matchRatio = queryWords.length > 0 ? matchedWords / queryWords.length : 0;
        if (matchRatio > 0.7) textMatchScore += 0.15;
        else if (matchRatio > 0.5) textMatchScore += 0.08;

        // ── 6. Exact phrase in content ──
        let phraseBonus = 0;
        for (const bg of queryBigrams) {
            if (lowerContent.includes(bg)) phraseBonus += 0.08;
        }

        // ── 7. Source priority ──
        let sourceBonus = 0;
        if (chunk.source_type === 'guideline') sourceBonus = 0.03;
        else if (chunk.source_type === 'government') sourceBonus = 0.02;

        const totalScore = titleScore + topicTitleBonus + vectorSim + keywordScore + textMatchScore + phraseBonus + sourceBonus;

        return {
            id: chunk.id,
            content: chunk.content,
            word_count: chunk.word_count,
            medical_topic: chunk.medical_topic,
            specialty: chunk.specialty,
            title: chunk.title,
            chapter: chunk.chapter,
            section: chunk.section,
            page_number: chunk.page_number,
            source_id: chunk.source_id,
            source_name: chunk.source_name,
            source_type: chunk.source_type,
            author: chunk.author,
            publisher: chunk.publisher,
            year: chunk.year,
            url: chunk.url,
            license: chunk.license,
            score: Math.round(totalScore * 1000) / 1000,
            vectorSimilarity: Math.round(vectorSim * 1000) / 1000
        };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Apply per-source limit and minimum similarity
    const sourceCounts = {};
    const filtered = [];
    for (const chunk of scored) {
        if (chunk.score < MIN_SIMILARITY) continue;
        sourceCounts[chunk.source_id] = (sourceCounts[chunk.source_id] || 0) + 1;
        if (sourceCounts[chunk.source_id] > MAX_RESULTS_PER_SOURCE) continue;
        filtered.push(chunk);
        if (filtered.length >= limit) break;
    }

    // Deduplicate by source_id + section
    const seen = new Set();
    const deduped = filtered.filter(chunk => {
        const key = `${chunk.source_id}:${chunk.section || chunk.chapter || chunk.title}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Extract unique sources for citation
    const sourcesMap = new Map();
    for (const chunk of deduped) {
        if (!sourcesMap.has(chunk.source_id)) {
            sourcesMap.set(chunk.source_id, {
                id: chunk.source_id,
                name: chunk.source_name,
                type: chunk.source_type,
                author: chunk.author,
                publisher: chunk.publisher,
                year: chunk.year,
                url: chunk.url,
                license: chunk.license,
                relevanceScore: chunk.score
            });
        }
    }

    return {
        chunks: deduped,
        sources: Array.from(sourcesMap.values()),
        query,
        topics: queryTopics,
        totalResults: allChunks.length,
        matchedResults: deduped.length
    };
}

/**
 * Get source metadata
 */
async function getSourceMetadata(sourceId) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM medical_sources WHERE id = ?', [sourceId], (err, row) => {
            err ? reject(err) : resolve(row);
        });
    });
}

/**
 * Get all sources with stats
 */
async function getAllSources(filters = {}) {
    let sql = `SELECT s.*, 
               (SELECT COUNT(*) FROM medical_documents d WHERE d.source_id = s.id) as document_count,
               (SELECT COUNT(*) FROM medical_chunks c WHERE c.source_id = s.id) as chunk_count_actual
               FROM medical_sources s WHERE s.status != 'deleted'`;
    const params = [];

    if (filters.type) {
        sql += ` AND s.source_type = ?`;
        params.push(filters.type);
    }
    if (filters.status) {
        sql += ` AND s.status = ?`;
        params.push(filters.status);
    }

    sql += ` ORDER BY s.created_at DESC`;

    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
    });
}

/**
 * Get KB statistics
 */
async function getStats() {
    const stats = await new Promise((resolve, reject) => {
        db.get(`
            SELECT
                (SELECT COUNT(*) FROM medical_sources WHERE status != 'deleted') as total_sources,
                (SELECT COUNT(*) FROM medical_sources WHERE source_type = 'free' AND status != 'deleted') as free_sources,
                (SELECT COUNT(*) FROM medical_sources WHERE source_type = 'licensed' AND status != 'deleted') as licensed_sources,
                (SELECT COUNT(*) FROM medical_sources WHERE source_type = 'guideline' AND status != 'deleted') as guideline_sources,
                (SELECT COUNT(*) FROM medical_sources WHERE source_type = 'research' AND status != 'deleted') as research_sources,
                (SELECT COUNT(*) FROM medical_sources WHERE source_type = 'government' AND status != 'deleted') as government_sources,
                (SELECT COUNT(*) FROM medical_documents WHERE status = 'indexed') as total_documents,
                (SELECT COUNT(*) FROM medical_chunks) as total_chunks,
                (SELECT COUNT(*) FROM medical_sources WHERE status = 'indexed') as indexed_sources,
                (SELECT COUNT(*) FROM medical_sources WHERE status = 'failed') as failed_sources,
                (SELECT COUNT(*) FROM medical_sources WHERE status = 'pending') as pending_sources,
                (SELECT MAX(indexed_at) FROM medical_sources WHERE status = 'indexed') as last_indexed
        `, (err, row) => err ? reject(err) : resolve(row));
    });
    return stats;
}

/**
 * Get documents for a source
 */
async function getSourceDocuments(sourceId) {
    return new Promise((resolve, reject) => {
        db.all(
            'SELECT * FROM medical_documents WHERE source_id = ? ORDER BY id',
            [sourceId],
            (err, rows) => err ? reject(err) : resolve(rows || [])
        );
    });
}

/**
 * Get chunks for a document
 */
async function getDocumentChunks(documentId) {
    return new Promise((resolve, reject) => {
        db.all(
            'SELECT * FROM medical_chunks WHERE document_id = ? ORDER BY chunk_index',
            [documentId],
            (err, rows) => err ? reject(err) : resolve(rows || [])
        );
    });
}

module.exports = {
    searchKnowledge,
    getSourceMetadata,
    getAllSources,
    getStats,
    getSourceDocuments,
    getDocumentChunks
};
