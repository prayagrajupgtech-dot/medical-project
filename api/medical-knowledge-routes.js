/**
 * Medical Knowledge API Routes
 * POST /api/medical-knowledge/search
 * POST /api/medical-knowledge/index
 * POST /api/medical-knowledge/sources
 * GET  /api/medical-knowledge/sources
 * GET  /api/medical-knowledge/sources/:id
 * GET  /api/medical-knowledge/stats
 * POST /api/medical-knowledge/test
 * DELETE /api/medical-knowledge/sources/:id
 * POST /api/medical-knowledge/reindex/:id
 */

const express = require('express');
const router = express.Router();
const { db } = require('../database/config');
const medicalKnowledgeService = require('./medical-knowledge-service');

// ── Middleware ──────────────────────────────────────────────────────────────────

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access token required' });

    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'doctor_ai_secret_key_2024';

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
}

function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

// ── Search Knowledge Base ──────────────────────────────────────────────────────

router.post('/search', authenticateToken, async (req, res) => {
    try {
        const { query, topic, specialty, sourceType, limit } = req.body;
        if (!query) return res.status(400).json({ error: 'Query is required' });

        const result = await medicalKnowledgeService.searchKnowledge(query, {
            limit: limit || 8,
            topic,
            specialty,
            sourceType
        });

        res.json({
            success: true,
            ...result
        });
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: 'Search failed: ' + err.message });
    }
});

// ── Get Statistics ─────────────────────────────────────────────────────────────

router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const stats = await medicalKnowledgeService.getStats();
        res.json({ success: true, stats });
    } catch (err) {
        console.error('Stats error:', err);
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

// ── List Sources ───────────────────────────────────────────────────────────────

router.get('/sources', authenticateToken, async (req, res) => {
    try {
        const sources = await medicalKnowledgeService.getAllSources({
            type: req.query.type,
            status: req.query.status
        });
        res.json({ success: true, sources });
    } catch (err) {
        console.error('Sources list error:', err);
        res.status(500).json({ error: 'Failed to list sources' });
    }
});

// ── Get Single Source ──────────────────────────────────────────────────────────

router.get('/sources/:id', authenticateToken, async (req, res) => {
    try {
        const source = await medicalKnowledgeService.getSourceMetadata(req.params.id);
        if (!source) return res.status(404).json({ error: 'Source not found' });

        const documents = await medicalKnowledgeService.getSourceDocuments(req.params.id);
        res.json({ success: true, source, documents });
    } catch (err) {
        console.error('Source detail error:', err);
        res.status(500).json({ error: 'Failed to get source' });
    }
});

// ── Add Source (Admin only) ────────────────────────────────────────────────────

router.post('/sources', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const {
            source_type, source_name, author, publisher, edition, year,
            license, url, copyright_status, content, title, chapter, section
        } = req.body;

        if (!source_type || !source_name) {
            return res.status(400).json({ error: 'source_type and source_name are required' });
        }

        if (!['free', 'licensed', 'guideline', 'research', 'government'].includes(source_type)) {
            return res.status(400).json({ error: 'Invalid source_type' });
        }

        // Insert source
        const sourceResult = await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO medical_sources (source_type, source_name, author, publisher, edition, year, license, url, copyright_status, added_by, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
                [source_type, source_name, author || null, publisher || null, edition || null,
                 year || null, license || null, url || null, copyright_status || 'open', req.user.id],
                function(err) { err ? reject(err) : resolve({ id: this.lastID }); }
            );
        });

        // If content is provided, ingest it immediately
        if (content) {
            const result = await medicalKnowledgeService.ingestTextSource(
                sourceResult.id,
                title || source_name,
                content,
                { chapter, section }
            );

            return res.json({
                success: true,
                source: { id: sourceResult.id, source_name, source_type },
                ingestion: result
            });
        }

        res.json({
            success: true,
            source: { id: sourceResult.id, source_name, source_type },
            message: 'Source created. Add documents to index content.'
        });
    } catch (err) {
        console.error('Add source error:', err);
        res.status(500).json({ error: 'Failed to add source: ' + err.message });
    }
});

// ── Add Document to Source (Admin only) ────────────────────────────────────────

router.post('/sources/:id/documents', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { title, content, chapter, section, pageStart, pageEnd } = req.body;
        const sourceId = req.params.id;

        if (!title || !content) {
            return res.status(400).json({ error: 'title and content are required' });
        }

        const source = await medicalKnowledgeService.getSourceMetadata(sourceId);
        if (!source) return res.status(404).json({ error: 'Source not found' });

        const result = await medicalKnowledgeService.ingestDocument(
            sourceId, title, content,
            { chapter, section, pageStart, pageEnd }
        );

        res.json({ success: true, document: result });
    } catch (err) {
        console.error('Add document error:', err);
        res.status(500).json({ error: 'Failed to add document: ' + err.message });
    }
});

// ── Re-index Source ────────────────────────────────────────────────────────────

router.post('/reindex/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await medicalKnowledgeService.reindexSource(req.params.id);
        res.json({ success: true, result });
    } catch (err) {
        console.error('Reindex error:', err);
        res.status(500).json({ error: 'Reindex failed: ' + err.message });
    }
});

// ── Delete Source ──────────────────────────────────────────────────────────────

router.delete('/sources/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await medicalKnowledgeService.deleteSource(req.params.id);
        res.json({ success: true, message: 'Source deleted' });
    } catch (err) {
        console.error('Delete source error:', err);
        res.status(500).json({ error: 'Delete failed' });
    }
});

// ── Test RAG (Admin only) ─────────────────────────────────────────────────────

router.post('/test', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) return res.status(400).json({ error: 'Query is required' });

        const result = await medicalKnowledgeService.generateRAGResponse(query, {
            role: 'admin'
        });

        res.json({
            success: true,
            query,
            response: result.response,
            sources: result.sources,
            safetyFlag: result.safetyFlag,
            intent: result.intent,
            topics: result.topics,
            evidence: result.evidence,
            chunksUsed: result.chunksUsed,
            latencyMs: result.latencyMs
        });
    } catch (err) {
        console.error('RAG test error:', err);
        res.status(500).json({ error: 'Test failed: ' + err.message });
    }
});

// ── Index Free Medical Content (Admin) ────────────────────────────────────────

router.post('/index-content', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { source_name, source_type, author, publisher, year, url, license, documents } = req.body;

        if (!source_name || !documents || !Array.isArray(documents)) {
            return res.status(400).json({ error: 'source_name and documents array are required' });
        }

        // Create source
        const sourceResult = await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO medical_sources (source_type, source_name, author, publisher, year, license, url, added_by, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'indexing')`,
                [source_type || 'free', source_name, author || null, publisher || null,
                 year || null, license || null, url || null, req.user.id],
                function(err) { err ? reject(err) : resolve({ id: this.lastID }); }
            );
        });

        const results = [];
        for (const doc of documents) {
            try {
                const result = await medicalKnowledgeService.ingestDocument(
                    sourceResult.id,
                    doc.title,
                    doc.content,
                    { chapter: doc.chapter, section: doc.section, pageStart: doc.pageStart }
                );
                results.push(result);
            } catch (docErr) {
                results.push({ title: doc.title, error: docErr.message });
            }
        }

        res.json({
            success: true,
            source: { id: sourceResult.id, source_name },
            documents: results,
            totalChunks: results.reduce((sum, r) => sum + (r.chunkCount || 0), 0)
        });
    } catch (err) {
        console.error('Index content error:', err);
        res.status(500).json({ error: 'Indexing failed: ' + err.message });
    }
});

module.exports = router;
