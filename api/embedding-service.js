/**
 * Embedding Service — TF-IDF + Character N-gram based vector generation
 * No external API keys required. Runs entirely locally.
 * Generates vectors for medical text similarity search.
 */

const crypto = require('crypto');

// ── Configuration ──────────────────────────────────────────────────────────────
const VOCAB_SIZE = 5000;
const NGRAM_RANGE = [2, 4];
const MAX_FEATURES = 3000;
const IDF_CACHE = new Map();

// ── Tokenizer ──────────────────────────────────────────────────────────────────
const MEDICAL_STOP_WORDS = new Set([
    'the','a','an','is','are','was','were','be','been','being','have','has','had',
    'do','does','did','will','would','shall','should','may','might','can','could',
    'to','of','in','for','on','with','at','by','from','as','into','through','during',
    'before','after','above','below','between','out','off','over','under','again',
    'further','then','once','here','there','when','where','why','how','all','both',
    'each','few','more','most','other','some','such','no','nor','not','only','own',
    'same','so','than','too','very','just','because','but','and','or','if','while',
    'about','up','it','its','this','that','these','those','i','me','my','we','our',
    'you','your','he','him','his','she','her','they','them','their','what','which',
    'who','whom','these','those','am','also','very','often','however','still',
    'within','along','across','well','back','even','still','new','like','well',
    'also','much','many','often','well','back','even','still','new','one','two',
    'first','last','long','great','little','right','old','big','high','different',
    'small','large','next','early','young','important','public','bad','same','able'
]);

function tokenize(text) {
    if (!text || typeof text !== 'string') return [];
    return text.toLowerCase()
        .replace(/[^a-z0-9\s\-\/]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 2 && !MEDICAL_STOP_WORDS.has(t));
}

function generateNgrams(text, minN, maxN) {
    const ngrams = [];
    const clean = text.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (let n = minN; n <= maxN; n++) {
        for (let i = 0; i <= clean.length - n; i++) {
            ngrams.push(clean.substring(i, i + n));
        }
    }
    return ngrams;
}

// ── Hashing Trick for Fixed-Size Vectors ───────────────────────────────────────
function hashToIndex(item, size) {
    const hash = crypto.createHash('md5').update(item).digest();
    return hash.readUInt32LE(0) % size;
}

function createVector(tokens, ngrams, size) {
    const vector = new Float32Array(size);
    // Term frequency
    const tf = {};
    for (const t of tokens) {
        tf[t] = (tf[t] || 0) + 1;
    }
    for (const [term, count] of Object.entries(tf)) {
        const idx = hashToIndex(term, size);
        vector[idx] += 1 + Math.log(count);
    }
    // N-gram frequency (lower weight)
    const ngf = {};
    for (const ng of ngrams) {
        ngf[ng] = (ngf[ng] || 0) + 1;
    }
    for (const [gram, count] of Object.entries(ngf)) {
        const idx = hashToIndex(gram, size);
        vector[idx] += 0.3 * (1 + Math.log(count));
    }
    // L2 normalize
    let norm = 0;
    for (let i = 0; i < size; i++) norm += vector[i] * vector[i];
    norm = Math.sqrt(norm);
    if (norm > 0) {
        for (let i = 0; i < size; i++) vector[i] /= norm;
    }
    return vector;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Generate embedding vector for text
 * @param {string} text - Input text
 * @returns {string} JSON-serialized Float32Array
 */
function generateEmbedding(text) {
    const tokens = tokenize(text);
    const ngrams = generateNgrams(text, NGRAM_RANGE[0], NGRAM_RANGE[1]);
    const vector = createVector(tokens, ngrams, MAX_FEATURES);
    return JSON.stringify(Array.from(vector));
}

/**
 * Generate embeddings for multiple texts (batch)
 * @param {string[]} texts
 * @returns {string[]} Array of JSON-serialized vectors
 */
function generateEmbeddings(texts) {
    return texts.map(t => generateEmbedding(t));
}

/**
 * Cosine similarity between two vectors (stored as JSON strings)
 * @param {string} vecA - JSON vector
 * @param {string} vecB - JSON vector
 * @returns {number} Similarity score 0-1
 */
function cosineSimilarity(vecA, vecB) {
    try {
        const a = JSON.parse(vecA);
        const b = JSON.parse(vecB);
        if (!a || !b || a.length !== b.length) return 0;
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        const denom = Math.sqrt(normA) * Math.sqrt(normB);
        return denom > 0 ? dot / denom : 0;
    } catch {
        return 0;
    }
}

/**
 * Extract medical keywords from text
 * @param {string} text
 * @returns {string[]}
 */
function extractKeywords(text) {
    if (!text) return [];
    const tokens = tokenize(text);
    const tf = {};
    for (const t of tokens) {
        tf[t] = (tf[t] || 0) + 1;
    }
    return Object.entries(tf)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([word]) => word);
}

/**
 * Detect medical topics from text
 * @param {string} text
 * @returns {string[]} Detected topic names
 */
function detectMedicalTopics(text) {
    if (!text) return [];
    const lower = text.toLowerCase();
    const topicPatterns = {
        'cardiology': /\b(heart|cardiac|chest\s*pain|blood\s*pressure|hypertension|arrhythmia|cholesterol|cardiovascular|angina|myocardial|coronary|ecg|ekg|pulse|palpitation)\b/,
        'neurology': /\b(brain|neurological|headache|migraine|seizure|epilepsy|stroke|paralysis|numbness|tingling|vertigo|dementia|alzheimer|neuropathy|concussion)\b/,
        'pulmonology': /\b(lung|respiratory|asthma|copd|pneumonia|bronchitis|cough|breathing|shortness\s*of\s*breath|oxygen|pulmonary|pleural|spirometry)\b/,
        'gastroenterology': /\b(stomach|gi|gastrointestinal|abdominal|nausea|vomiting|diarrhea|constipation|acid|reflux|gerd|ulcer|hepatitis|liver|pancreas|gallbladder|ibs|crohn)\b/,
        'endocrinology': /\b(thyroid|diabetes|insulin|glucose|blood\s*sugar|hormone|endocrine|cortisol|adrenal|pituitary|metabolic|a1c|hba1c|hypothyroid|hyperthyroid)\b/,
        'nephrology': /\b(kidney|renal|creatinine|bun|dialysis|urine|urinary|nephritis|glomerul|electrolyte|potassium|sodium)\b/,
        'hematology': /\b(blood|hemoglobin|hematocrit|platelet|wbc|rbc|anemia|leukemia|clotting|coagulation|sickle|thrombocyte|differential)\b/,
        'dermatology': /\b(skin|rash|acne|eczema|dermatitis|psoriasis|lesion|mole|pigment|itching|urticaria|hives|dermal|melanoma)\b/,
        'psychiatry': /\b(anxiety|depression|mental\s*health|panic|bipolar|schizophrenia|ptsd|ocd|phobia|psychiatric|psychological|mood|insomnia|sleep|stress|cognitive)\b/,
        'orthopedics': /\b(bone|joint|fracture|arthritis|back\s*pain|spine|knee|shoulder|hip|musculoskeletal|orthopedic|ligament|tendon|cartilage)\b/,
        'ophthalmology': /\b(eye|vision|visual|cataract|glaucoma|retina|cornea|optical|ophthalmology|blindness|myopia|hyperopia|presbyopia)\b/,
        'ent': /\b(ear|nose|throat|sinus|hearing|tinnitus|tonsil|adenoid|laryngitis|otitis|rhinitis|sinusitis|vertigo|ent)\b/,
        'rheumatology': /\b(rheumatoid|lupus|autoimmune|inflammatory|joint\s*pain|spondylos|fibromyalgia|gout|vasculitis|rheumatic)\b/,
        'oncology': /\b(cancer|tumor|oncology|chemotherapy|radiation|metastasis|carcinoma|lymphoma|leukemia|malignant|benign|biopsy)\b/,
        'infectious': /\b(infection|infectious|bacteria|virus|viral|bacterial|fungal|antibiotic|antiviral|sepsis|fever|immunization|vaccine|covid|influenza|hepatitis|tuberculosis|hiv)\b/,
        'nutrition': /\b(nutrition|diet|vitamin|mineral|supplement|calorie|protein|carbohydrate|fat|fiber|obesity|bmi|weight|malnutrition)\b/,
        'womens_health': /\b(pregnancy|prenatal|menstrual|menopause|gynecology|breast|ovarian|uterine|cervical|contraception|fertility|obstetric)\b/,
        'mens_health': /\b(prostate|testosterone|erectile|male|andrology)\b/,
        'pediatrics': /\b(child|pediatric|infant|newborn|neonatal|adolescent|vaccination|immunization|growth|development)\b/,
        'preventive': /\b(prevention|preventive|screening|checkup|vaccination|immunization|health\s*maintenance|wellness|prophylactic)\b/,
        'emergency': /\b(emergency|emergency\s*medicine|triage|resuscitation|trauma|critical\s*care|icu|intensive\s*care|life-threatening)\b/,
        'medication': /\b(drug|medication|pharmaceutical|pharmacology|dosage|prescription|side\s*effect|interaction|contraindication|overdose|antibiotic|analgesic|nsaid)\b/,
        'laboratory': /\b(lab\s*test|laboratory|blood\s*test|urine\s*test|biopsy|culture|sensitivity|serology|panel|cbc|cmp|lipid\s*panel)\b/,
        'first_aid': /\b(first\s*aid|cpr|wound|burn|bleeding|fracture|splint|bandage|emergency\s*response|basic\s*life\s*support)\b/,
        'general_medicine': /\b(general\s*medicine|internal\s*medicine|primary\s*care|family\s*medicine|physical\s*examination|history\s*of\s*present|review\s*of\s*systems)\b/
    };

    const detected = [];
    for (const [topic, pattern] of Object.entries(topicPatterns)) {
        if (pattern.test(lower)) {
            detected.push(topic);
        }
    }
    return detected.length > 0 ? detected : ['general_medicine'];
}

/**
 * Classify text into a medical specialty
 * @param {string} text
 * @returns {string}
 */
function classifySpecialty(text) {
    const topics = detectMedicalTopics(text);
    const specialtyMap = {
        'cardiology': 'Cardiology',
        'neurology': 'Neurology',
        'pulmonology': 'Pulmonology',
        'gastroenterology': 'Gastroenterology',
        'endocrinology': 'Endocrinology',
        'nephrology': 'Nephrology',
        'hematology': 'Hematology',
        'dermatology': 'Dermatology',
        'psychiatry': 'Psychiatry',
        'orthopedics': 'Orthopedics',
        'ophthalmology': 'Ophthalmology',
        'ent': 'ENT',
        'rheumatology': 'Rheumatology',
        'oncology': 'Oncology',
        'infectious': 'Infectious Diseases',
        'nutrition': 'Nutrition',
        'womens_health': 'Women\'s Health',
        'mens_health': 'Men\'s Health',
        'pediatrics': 'Pediatrics',
        'preventive': 'Preventive Medicine',
        'emergency': 'Emergency Medicine',
        'medication': 'Pharmacology',
        'laboratory': 'Laboratory Medicine',
        'first_aid': 'First Aid',
        'general_medicine': 'General Medicine'
    };
    for (const t of topics) {
        if (specialtyMap[t]) return specialtyMap[t];
    }
    return 'General Medicine';
}

module.exports = {
    generateEmbedding,
    generateEmbeddings,
    cosineSimilarity,
    extractKeywords,
    detectMedicalTopics,
    classifySpecialty,
    tokenize
};
