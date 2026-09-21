/**
 * Medical Safety Layer
 * Emergency detection, red flag identification, evidence validation
 */

// ── Emergency Detection ────────────────────────────────────────────────────────

const EMERGENCY_PATTERNS = {
    critical: {
        patterns: [
            /severe\s+chest\s*pain/i,
            /crushing\s+chest/i,
            /heart\s*attack/i,
            /myocardial\s+infarction/i,
            /stroke\s+symptoms?/i,
            /face\s+drooping/i,
            /arm\s+weakness/i,
            /speech\s+difficulty/i,
            /sudden\s+numbness/i,
            /sudden\s+weakness.*(face|arm|leg)/i,
            /loss\s+of\s+consciousness/i,
            /unresponsive/i,
            /not\s+breathing/i,
            /stopped\s+breathing/i,
            /severe\s+difficulty\s+breathing/i,
            /can'?t\s+breathe/i,
            /choking/i,
            /anaphyla/i,
            /severe\s+allergic\s+reaction/i,
            /severe\s+bleeding/i,
            /uncontrolled\s+bleeding/i,
            /seizure/i,
            /convulsion/i,
            /suicid/i,
            /want\s+to\s+die/i,
            /kill\s+myself/i,
            /self[-\s]*harm/i,
            /overdose/i,
            /poisoning/i,
            /severe\s+head\s+injury/i,
            /loss\s+of\s+vision.*sudden/i,
            /sudden\s+severe\s+headache/i,
            /thunderclap\s+headache/i,
            /neck\s+stiffness.*fever/i,
            /meningitis/i,
            /severe\s+abdominal\s+pain/i,
            /rigid\s+abdomen/i,
            /coughing\s+blood/i,
            /vomiting\s+blood/i,
            /hematemesis/i,
            /severe\s+burn/i,
            /major\s+trauma/i,
            /paralysis.*sudden/i,
            /confusion.*sudden/i,
            /altered\s+mental\s+status/i,
            /high\s+fever.*child.*(?:under|<)\s*(?:3|6)\s*months?/i,
            /newborn.*fever/i,
            /seizure.*child.*fever/i,
            /severe\s+dehydration/i,
            /blood\s+clot.*(?:lung|leg|brain)/i,
            /pulmonary\s+embolism/i,
            /aortic\s+dissection/i
        ],
        severity: 'critical',
        message: 'This could be a medical emergency.',
        advice: 'Please seek immediate medical attention. Call your local emergency number (such as 911, 112, or 108) or go to the nearest emergency room immediately.'
    },
    high: {
        patterns: [
            /moderate\s+chest\s+pain/i,
            /persistent\s+vomiting/i,
            /vomiting.*blood/i,
            /high\s+fever/i,
            /fever.*above\s*(?:10[3-9]|104|39|40)/i,
            /severe\s+abdominal\s+pain/i,
            /difficulty\s+breathing/i,
            /shortness\s+of\s+breath.*severe/i,
            /blood\s+in\s+(?:stool|urine)/i,
            /hematuria/i,
            /melena/i,
            /severe\s+headache.*(?:visual|vision|neck\s+stiff)/i,
            /confusion/i,
            /disorientation/i,
            /severe\s+dizziness/i,
            /fainting/i,
            /syncope/i,
            /irregular\s+heartbeat.* symptomatic/i,
            /chest\s+discomfort.*(?:arm|jaw|back)/i,
            /sudden\s+swelling.*(?:leg|arm)/i,
            /signs?\s+of\s+stroke/i,
            /face\s+(?:droop|numb)/i,
            /slurred\s+speech/i
        ],
        severity: 'high',
        message: 'These symptoms may require urgent medical evaluation.',
        advice: 'Please contact a healthcare provider promptly or visit an urgent care/emergency department. If symptoms worsen, call emergency services.'
    }
};

// ── Mental Health Crisis Detection ─────────────────────────────────────────────

const MENTAL_HEALTH_CRISIS_PATTERNS = [
    /suicid/i,
    /kill\s+myself/i,
    /want\s+to\s+die/i,
    /end\s+(?:my\s+)?life/i,
    /self[-\s]*harm/i,
    /cutting\s+myself/i,
    /not\s+worth\s+living/i,
    /no\s+reason\s+to\s+live/i,
    /better\s+off\s+dead/i,
    /plan\s+to\s+(?:die|kill)/i,
    /overdose/i,
    /taking\s+(?:too\s+many|all)\s+(?:pills?|tablets?)/i,
    /jumping?\s+(?:off|from)/i,
    /hanging\s+myself/i
];

// ── Functions ──────────────────────────────────────────────────────────────────

/**
 * Detect emergency situation from text
 * @param {string} text - User's message
 * @returns {object} { isEmergency, severity, message, advice, matchedPatterns }
 */
function detectEmergency(text) {
    if (!text) return { isEmergency: false, severity: 'none', message: '', advice: '', matchedPatterns: [] };

    const lower = text.toLowerCase();
    const matched = [];

    // Check critical patterns first
    for (const pattern of EMERGENCY_PATTERNS.critical.patterns) {
        if (pattern.test(text)) {
            matched.push({ pattern: pattern.source, severity: 'critical' });
        }
    }

    // Check high severity patterns
    for (const pattern of EMERGENCY_PATTERNS.high.patterns) {
        if (pattern.test(text)) {
            matched.push({ pattern: pattern.source, severity: 'high' });
        }
    }

    // Check mental health crisis
    for (const pattern of MENTAL_HEALTH_CRISIS_PATTERNS) {
        if (pattern.test(text)) {
            matched.push({ pattern: pattern.source, severity: 'critical', category: 'mental_health' });
        }
    }

    if (matched.length === 0) {
        return { isEmergency: false, severity: 'none', message: '', advice: '', matchedPatterns: [] };
    }

    // Get highest severity
    const highestSeverity = matched.some(m => m.severity === 'critical') ? 'critical' : 'high';
    const emergencyInfo = highestSeverity === 'critical' ? EMERGENCY_PATTERNS.critical : EMERGENCY_PATTERNS.high;

    return {
        isEmergency: true,
        severity: highestSeverity,
        message: emergencyInfo.message,
        advice: emergencyInfo.advice,
        matchedPatterns: matched.map(m => m.pattern),
        hasMentalHealthCrisis: matched.some(m => m.category === 'mental_health')
    };
}

/**
 * Validate that retrieved evidence is sufficient
 * @param {object} retrievalResult - Result from searchKnowledge
 * @returns {object} { sufficient, confidence, reason }
 */
function validateEvidence(retrievalResult) {
    const { chunks } = retrievalResult;

    if (!chunks || chunks.length === 0) {
        return {
            sufficient: false,
            confidence: 0,
            reason: 'No relevant medical sources found in the knowledge base.'
        };
    }

    const avgScore = chunks.reduce((sum, c) => sum + c.score, 0) / chunks.length;
    const topScore = chunks[0].score;
    const sourceCount = new Set(chunks.map(c => c.source_id)).size;

    let confidence = 0;
    if (topScore > 0.5) confidence += 0.4;
    else if (topScore > 0.3) confidence += 0.3;
    else if (topScore > 0.15) confidence += 0.2;
    else confidence += 0.1;

    if (sourceCount >= 3) confidence += 0.3;
    else if (sourceCount >= 2) confidence += 0.2;
    else confidence += 0.1;

    if (chunks.length >= 5) confidence += 0.3;
    else if (chunks.length >= 3) confidence += 0.2;
    else confidence += 0.1;

    const sufficient = confidence >= 0.3 && topScore >= 0.1;

    return {
        sufficient,
        confidence: Math.round(confidence * 100) / 100,
        reason: sufficient
            ? `Found ${chunks.length} relevant chunks from ${sourceCount} source(s).`
            : 'Insufficient reliable evidence found. Recommend consulting healthcare provider.',
        sourceCount,
        chunkCount: chunks.length,
        topScore
    };
}

/**
 * Format source citations for display
 * @param {object[]} sources - Array of source objects
 * @returns {string} Formatted citation text
 */
function formatCitations(sources) {
    if (!sources || sources.length === 0) return '';

    const lines = sources.map((s, i) => {
        let citation = `${i + 1}. **${s.name}**`;
        if (s.author) citation += ` — ${s.author}`;
        if (s.publisher) citation += `, ${s.publisher}`;
        if (s.year) citation += ` (${s.year})`;
        if (s.url) citation += ` — [Link](${s.url})`;
        if (s.license && s.license !== 'open') citation += ` [${s.license}]`;
        return citation;
    });

    return '**Sources:**\n' + lines.join('\n');
}

/**
 * Build the safety-checked response prefix
 * @param {object} emergency - Result from detectEmergency
 * @returns {string} Safety prefix or empty string
 */
function buildSafetyPrefix(emergency) {
    if (!emergency || !emergency.isEmergency) return '';

    if (emergency.hasMentalHealthCrisis) {
        return `⚠️ **I'm concerned about what you're sharing.** If you're thinking about hurting yourself, please reach out for help right now:\n\n` +
            `- **National Suicide Prevention Lifeline**: 988 (US) or your local crisis line\n` +
            `- **Crisis Text Line**: Text HOME to 741741\n` +
            `- **Emergency Services**: 911 (US) or your local emergency number\n\n` +
            `You are not alone. Professional help is available 24/7.\n\n---\n\n`;
    }

    if (emergency.severity === 'critical') {
        return `🚨 **${emergency.message}**\n\n${emergency.advice}\n\n` +
            `I can provide general information, but this is not a substitute for immediate professional medical evaluation.\n\n---\n\n`;
    }

    if (emergency.severity === 'high') {
        return `⚠️ **${emergency.message}**\n\n${emergency.advice}\n\n---\n\n`;
    }

    return '';
}

module.exports = {
    detectEmergency,
    validateEvidence,
    formatCitations,
    buildSafetyPrefix,
    EMERGENCY_PATTERNS,
    MENTAL_HEALTH_CRISIS_PATTERNS
};
