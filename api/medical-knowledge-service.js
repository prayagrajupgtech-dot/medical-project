/**
 * Medical Knowledge Service — RAG Orchestrator
 * Ties together: embedding, ingestion, retrieval, safety, citations
 * This is the main service that Shrijal's chat uses.
 */

const { db } = require('../database/config');
const embeddingService = require('./embedding-service');
const { searchKnowledge, getStats, getAllSources, getSourceMetadata, getSourceDocuments, getDocumentChunks } = require('./knowledge-retrieval');
const { ingestDocument, ingestTextSource, reindexSource, deleteSource } = require('./document-ingestion');
const safety = require('./medical-safety');

// ── Intent Detection ───────────────────────────────────────────────────────────

const MEDICAL_INTENTS = {
    symptom_info: {
        patterns: [
            /what\s+(?:is|are|causes?|could)\b.*(?:symptom|sign|cause|reason)/i,
            /why\s+(?:do\s+i|does|am\s+i|is\s+my)/i,
            /tell\s+me\s+about/i,
            /explain/i,
            /what\s+does\s+it\s+mean/i,
            /information\s+about/i,
            /learn\s+about/i
        ],
        label: 'Symptom/Condition Information'
    },
    avoid: {
        patterns: [
            /what\s+(?:should|can|must)\s+i\s+avoid/i,
            /what\s+to\s+avoid/i,
            /food\s+to\s+avoid/i,
            /what\s+(?:should|must)\s+(?:i|we)\s+not\s+(?:do|eat|take)/i,
            /restrictions?/i,
            /precautions?/i,
            /contraindication/i,
            /should\s+i\s+not/i
        ],
        label: 'What to Avoid'
    },
    medication: {
        patterns: [
            /(?:drug|medication|medicine|tablet|pill|dose|dosage)/i,
            /(?:antibiotic|paracetamol|ibuprofen|aspirin|metformin|atorvastatin)/i,
            /interaction/i,
            /side\s*effect/i,
            /prescription/i
        ],
        label: 'Medication Information'
    },
    lab_result: {
        patterns: [
            /(?:blood\s+test|lab\s+result|test\s+result)/i,
            /(?:hemoglobin|glucose|cholesterol|creatinine|wbc|rbc|platelet|tsh|a1c)/i,
            /(?:cbc|cmp|lipid|panel)/i,
            /what\s+(?:does|is)\s+my\s+(?:result|test|level)/i,
            /(?:high|low|normal)\s+(?:value|level|result)/i
        ],
        label: 'Lab Result Interpretation'
    },
    emergency: {
        patterns: [
            /emergency/i,
            /urgent/i,
            /immediate/i,
            /serious/i,
            /dangerous/i,
            /life[-\s]*threatening/i,
            /when\s+to\s+(?:go\s+to|call|seek)/i,
            /call\s+(?:ambulance|emergency|911|112|108)/i
        ],
        label: 'Emergency Information'
    },
    prevention: {
        patterns: [
            /how\s+(?:to|can\s+i)\s+prevent/i,
            /prevention/i,
            /precaution/i,
            /avoid\s+(?:getting|having|developing)/i,
            /risk\s+factor/i,
            /stay\s+(?:healthy|fit)/i
        ],
        label: 'Prevention'
    },
    when_to_see_doctor: {
        patterns: [
            /when\s+(?:should|to|do\s+i)\s+(?:see|visit|consult|go\s+to)\s+(?:a\s+)?(?:doctor|physician|hospital|er|clinic)/i,
            /should\s+i\s+(?:see|visit|consult)\s+(?:a\s+)?(?:doctor|physician)/i,
            /do\s+i\s+need\s+(?:to\s+see|medical|professional)/i
        ],
        label: 'When to See a Doctor'
    },
    mental_health: {
        patterns: [
            /(?:anxiety|depression|stress|panic|mental\s+health|mood|insomnia|sleep\s+problem)/i,
            /(?:feeling|feel)\s+(?:sad|anxious|worried|nervous|hopeless|worthless)/i,
            /(?:can'?t|unable\s+to)\s+(?:sleep|relax|focus|concentrate)/i
        ],
        label: 'Mental Health'
    }
};

function detectIntent(query) {
    const lower = query.toLowerCase();
    const detected = [];

    for (const [intent, config] of Object.entries(MEDICAL_INTENTS)) {
        for (const pattern of config.patterns) {
            if (pattern.test(query)) {
                detected.push({ intent, label: config.label, confidence: 0.8 });
                break;
            }
        }
    }

    if (detected.length === 0) {
        detected.push({ intent: 'general', label: 'General Medical', confidence: 0.5 });
    }

    return detected;
}

/**
 * Check if query is medical
 */
function isMedicalQuery(query) {
    const lower = query.toLowerCase();
    const checks = [
        /symptom|pain|fever|headache|cough|cold|flu|infection|disease|condition/,
        /treatment|medication|drug|doctor|hospital|health|medical|illness|diagnosis/,
        /test|blood|pressure|diabetes|cancer|heart|lung|brain|kidney|liver/,
        /stomach|skin|bone|joint|muscle|nerve|virus|bacteria|antibiotic|vitamin/,
        /mineral|diet|nutrition|exercise|weight|sleep|stress|anxiety|depression/,
        /mental|emergency|wound|burn|bleed|swell|rash|itch|nausea|vomit|diarrhea/,
        /constipation|dizzy|fatigue|weakness|tired|breath|chest|abdomen|back|neck/,
        /throat|ear|eye|nose|tooth|allerg|asthma|anemia|thyroid|cholesterol|sugar/,
        /insulin|vaccine|immuniz|pregnan|menstru|menopa|prostat|urin|stone|ulcer/,
        /reflux|ibs|crohn|lupus|arthritis|gout|eczema|psori|acne|cataract|glaucom/,
        /sinus|tonsil|hearing|tinnitus|epilep|seizur|stroke|paraly|migraine|vertigo/,
        /pneumonia|bronchit|copd|tuberculosis|covid|hepatit|hiv|sti|herpes|cancer/,
        /tumor|chemo|radiation|surgery|biopsy|hemoglobin|glucose|creatinine|platelet/,
        /wbc|rbc|bun|alt|ast|tsh|calcium|potassium|sodium|iron|ferritin|cholesterol/,
        /ldl|hdl|triglyceride|troponin|d-dimer|crp|esr|ana|a1c|hba1c|vitamin\s*d/,
        /prostate|erectile|infertil|osteopor|fibromyalgia|parkinson|alzheimer|dementia/,
        /conjunctiv|otitis|rhinit|asthma|emphysema|pulmonary|pleur|lymphoma|leukemia/,
        /sarcoma|carcinoma|melanoma|biopsy|patholog|lab\s*test|cbc|cmp|lipid|panel/,
        /first\s*aid|cpr|resuscitat|trauma|fracture|sprain|dislocat|ligament|tendon/,
        /depress|anxious|anxiety|worried|panic|insomnia|sleep\s*problem|mood\s*change/,
        /self[-\s]*harm|suicid|hopeless|worthless|emotional|psycholog|psychiatr/,
        /feeling\s+(?:sad|tired|weak|dizzy|sick|unwell|faint|numb)/,
        /have\s+(?:pain|fever|cough|cold|headache|nausea|rash)/,
        /avoid|precaution|prevent|warning|danger|emergency|urgent|serious/
    ];
    return checks.some(p => p.test(lower));
}

/**
 * Generate a medical response using RAG
 * @param {string} query - User's question
 * @param {object} context - { role, patientId, conversationHistory }
 * @returns {object} { response, sources, safetyFlag, intent, topics }
 */
async function generateRAGResponse(query, context = {}) {
    const startTime = Date.now();

    // 1. Safety check first
    const emergency = safety.detectEmergency(query);
    if (emergency.isEmergency && emergency.severity === 'critical') {
        const safetyPrefix = safety.buildSafetyPrefix(emergency);
        return {
            response: safetyPrefix + 'I understand you may be experiencing a medical emergency. While I can provide general health information, I cannot diagnose or treat emergencies. Please contact emergency services or go to the nearest emergency room immediately.\n\nIf you\'d like general information about this topic after you\'re safe, I\'m here to help.',
            sources: [],
            safetyFlag: true,
            intent: [{ intent: 'emergency', label: 'Emergency' }],
            topics: [],
            latencyMs: Date.now() - startTime
        };
    }

    // 2. Check if it's a medical query
    const intents = detectIntent(query);
    const medical = isMedicalQuery(query);

    if (!medical && intents[0]?.intent === 'general') {
        return {
            response: null, // Let Shrijal handle non-medical queries with her default behavior
            sources: [],
            safetyFlag: false,
            intent: intents,
            topics: [],
            latencyMs: Date.now() - startTime
        };
    }

    // 3. Retrieve relevant knowledge
    const retrievalResult = await searchKnowledge(query, { limit: 8 });

    // 4. Validate evidence
    const evidence = safety.validateEvidence(retrievalResult);

    // 5. Build response
    let responseText = '';
    const safetyPrefix = safety.buildSafetyPrefix(emergency);
    if (safetyPrefix) responseText += safetyPrefix;

    // Build context from retrieved chunks
    const contextParts = [];
    for (const chunk of retrievalResult.chunks.slice(0, 5)) {
        let sourceRef = '';
        if (chunk.source_name) {
            sourceRef = ` [Source: ${chunk.source_name}`;
            if (chunk.chapter) sourceRef += `, ${chunk.chapter}`;
            if (chunk.year) sourceRef += ` (${chunk.year})`;
            sourceRef += ']';
        }
        // Truncate long chunks to reasonable length for context
        const truncated = chunk.content.length > 600
            ? chunk.content.substring(0, 600) + '...'
            : chunk.content;
        contextParts.push(truncated + sourceRef);
    }

    const contextBlock = contextParts.join('\n\n---\n\n');

    // Format citations
    const citations = safety.formatCitations(retrievalResult.sources);

    // Build intent-specific response
    const intentTypes = intents.map(i => i.intent);

    if (intentTypes.includes('avoid')) {
        responseText += `Based on my medical knowledge sources, here's what I can tell you about precautions and things to avoid:\n\n`;
        responseText += contextBlock;
        if (citations) responseText += '\n\n' + citations;
        responseText += '\n\n*I can help explain medical information, but I am not a doctor. Please discuss specific restrictions with your healthcare provider for personalized advice.*';
    } else if (intentTypes.includes('when_to_see_doctor')) {
        responseText += `Based on medical guidelines, here's information about when to seek medical care:\n\n`;
        responseText += contextBlock;
        if (citations) responseText += '\n\n' + citations;
        responseText += '\n\n*When in doubt, it is always best to consult with a healthcare professional.*';
    } else if (intentTypes.includes('medication')) {
        responseText += `Here is what I found in my medical knowledge sources:\n\n`;
        responseText += contextBlock;
        if (citations) responseText += '\n\n' + citations;
        responseText += '\n\n*Medication information should always be verified with your doctor or pharmacist. Do not start, stop, or change medications without medical advice.*';
    } else if (intentTypes.includes('lab_result')) {
        responseText += `Here's what I found about lab test interpretation:\n\n`;
        responseText += contextBlock;
        if (citations) responseText += '\n\n' + citations;
        responseText += '\n\n*Lab results should be interpreted by your healthcare provider in the context of your full medical history.*';
    } else if (intentTypes.includes('mental_health')) {
        responseText += `Thank you for sharing. Mental health is important, and I want to provide helpful information.\n\n`;
        responseText += contextBlock;
        if (citations) responseText += '\n\n' + citations;
        if (emergency.hasMentalHealthCrisis) {
            responseText += '\n\n*If you\'re in crisis, please reach out to a mental health professional or crisis line immediately.*';
        } else {
            responseText += '\n\n*These symptoms can occur with various conditions. Consider discussing them with a mental health professional for proper evaluation.*';
        }
    } else if (intentTypes.includes('prevention')) {
        responseText += `Based on medical evidence, here's information about prevention:\n\n`;
        responseText += contextBlock;
        if (citations) responseText += '\n\n' + citations;
        responseText += '\n\n*Prevention strategies may vary based on individual health factors. Consult your healthcare provider for personalized prevention advice.*';
    } else {
        // General symptom/condition information
        responseText += `Based on my medical knowledge sources, here's what I can tell you:\n\n`;
        responseText += contextBlock;
        if (citations) responseText += '\n\n' + citations;
        responseText += '\n\n*I can help explain medical information, but this is not a diagnosis. If you have concerns, please consult a qualified healthcare professional.*';
    }

    // Log retrieval
    const latencyMs = Date.now() - startTime;
    try {
        db.run(
            `INSERT INTO medical_retrieval_logs (user_id, query, intent, topics, sources_retrieved, chunks_retrieved, response_generated, safety_flag, latency_ms)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                context.patientId || null,
                query.substring(0, 500),
                intents.map(i => i.intent).join(','),
                retrievalResult.topics.join(','),
                retrievalResult.sources.map(s => s.name).join(','),
                retrievalResult.chunks.length,
                1,
                emergency.isEmergency ? 1 : 0,
                latencyMs
            ]
        );
    } catch (e) {
        // Log failure is non-critical
    }

    return {
        response: responseText,
        sources: retrievalResult.sources,
        safetyFlag: emergency.isEmergency,
        intent: intents,
        topics: retrievalResult.topics,
        evidence,
        chunksUsed: retrievalResult.chunks.length,
        latencyMs
    };
}

module.exports = {
    generateRAGResponse,
    detectIntent,
    isMedicalQuery,
    // Re-export sub-services
    searchKnowledge,
    getStats,
    getAllSources,
    getSourceMetadata,
    getSourceDocuments,
    getDocumentChunks,
    ingestDocument,
    ingestTextSource,
    reindexSource,
    deleteSource,
    detectEmergency: safety.detectEmergency,
    validateEvidence: safety.validateEvidence,
    formatCitations: safety.formatCitations,
    buildSafetyPrefix: safety.buildSafetyPrefix,
    generateEmbedding: embeddingService.generateEmbedding,
    extractKeywords: embeddingService.extractKeywords,
    detectMedicalTopics: embeddingService.detectMedicalTopics,
    classifySpecialty: embeddingService.classifySpecialty
};
