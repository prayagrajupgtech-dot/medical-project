/**
 * report-type-analyzer.js
 * Specialized analyzers for 26+ medical report types.
 * Architecture per analyzer: detect() → extract() → validate() → analyze() → explain()
 *
 * Public API:
 *   detectReportType(text)         → { type, confidence, subType }
 *   analyzeByType(text, reportType) → { summary, findings, explanation, questionsForDoctor, whenToSeekHelp }
 */

// ─────────────────────────────────────────────────────────────────────────────
// Report Type Registry
// ─────────────────────────────────────────────────────────────────────────────

const REPORT_TYPES = {
    // ── Laboratory ──────────────────────────────────────────────────────────
    cbc: {
        id: 'cbc',
        name: 'Complete Blood Count',
        category: 'laboratory',
        aliases: ['cbc', 'complete blood count', 'full blood count', 'fbc', 'hemogram', 'blood count'],
        detect: (t) => /complete\s*blood\s*count|cbc|full\s*blood\s*count|fbc|hemogram/i.test(t),
        markers: ['hemoglobin', 'hgb', 'hematocrit', 'hct', 'wbc', 'white blood', 'rbc', 'red blood',
                  'platelet', 'plt', 'mcv', 'mch', 'mchc', 'rdw', 'neutrophil', 'lymphocyte',
                  'monocyte', 'eosinophil', 'basophil', 'reticulocyte', 'band cells'],
        criticalFindings: [
            { pattern: /hemoglobin.*(?:<\s*7|below\s*7)/i, message: 'Severely low hemoglobin — seek immediate care.' },
            { pattern: /wbc.*(?:>\s*30|above\s*30|<\s*1\b|below\s*1)/i, message: 'Dangerously abnormal WBC — seek immediate care.' },
            { pattern: /platelet.*(?:<\s*20|below\s*20)/i, message: 'Severely low platelets — risk of bleeding.' }
        ]
    },
    cmp: {
        id: 'cmp',
        name: 'Comprehensive Metabolic Panel',
        category: 'laboratory',
        aliases: ['cmp', 'comprehensive metabolic panel', 'metabolic panel', 'chemistry panel'],
        detect: (t) => /comprehensive\s*metabolic\s*panel|cmp|chemistry\s*panel|metabolic\s*panel/i.test(t),
        markers: ['glucose', 'bun', 'creatinine', 'sodium', 'potassium', 'chloride', 'co2',
                  'calcium', 'alt', 'ast', 'alp', 'bilirubin', 'albumin', 'total protein'],
        criticalFindings: [
            { pattern: /potassium.*(?:<\s*3|below\s*3|>\s*6|above\s*6)/i, message: 'Critical potassium level — seek immediate care.' },
            { pattern: /glucose.*(?:<\s*40|below\s*40|>\s*400|above\s*400)/i, message: 'Critical glucose level — seek immediate care.' },
            { pattern: /sodium.*(?:<\s*120|below\s*120|>\s*160|above\s*160)/i, message: 'Critical sodium level — seek immediate care.' }
        ]
    },
    bmp: {
        id: 'bmp',
        name: 'Basic Metabolic Panel',
        category: 'laboratory',
        aliases: ['bmp', 'basic metabolic panel', 'renal panel', 'kidney panel'],
        detect: (t) => /basic\s*metabolic\s*panel|bmp|renal\s*panel|kidney\s*panel/i.test(t),
        markers: ['glucose', 'bun', 'creatinine', 'sodium', 'potassium', 'chloride', 'co2', 'calcium'],
        criticalFindings: [
            { pattern: /creatinine.*(?:>\s*4|above\s*4)/i, message: 'Critically high creatinine — possible kidney failure.' },
            { pattern: /potassium.*(?:<\s*3|below\s*3|>\s*6|above\s*6)/i, message: 'Critical potassium level.' }
        ]
    },
    lipid: {
        id: 'lipid',
        name: 'Lipid Panel',
        category: 'laboratory',
        aliases: ['lipid panel', 'lipid profile', 'cholesterol panel', 'lipid'],
        detect: (t) => /lipid\s*(panel|profile)|cholesterol\s*(panel|profile|test)/i.test(t),
        markers: ['total cholesterol', 'ldl', 'hdl', 'triglycerides', 'vldl', 'non-hdl', 'cholesterol'],
        criticalFindings: [
            { pattern: /ldl.*(?:>\s*190|above\s*190)/i, message: 'Very high LDL — significantly elevated cardiovascular risk.' },
            { pattern: /triglycerides.*(?:>\s*500|above\s*500)/i, message: 'Very high triglycerides — risk of pancreatitis.' }
        ]
    },
    thyroid: {
        id: 'thyroid',
        name: 'Thyroid Panel',
        category: 'laboratory',
        aliases: ['thyroid panel', 'thyroid function', 'tsh', 'thyroid'],
        detect: (t) => /thyroid\s*(panel|function|test)|tsh\s*(test|level|panel)|free\s*t[34]/i.test(t),
        markers: ['tsh', 'free t4', 'ft4', 'free t3', 'ft3', 'total t4', 'total t3', 'thyroid'],
        criticalFindings: [
            { pattern: /tsh.*(?:>\s*10|above\s*10)/i, message: 'Significantly elevated TSH — possible hypothyroidism.' },
            { pattern: /tsh.*(?:<\s*0\.1|below\s*0\.1)/i, message: 'Very low TSH — possible hyperthyroidism.' }
        ]
    },
    diabetes: {
        id: 'diabetes',
        name: 'Diabetes Panel',
        category: 'laboratory',
        aliases: ['a1c', 'hba1c', 'hemoglobin a1c', 'diabetes panel', 'glucose tolerance', 'gtt', 'fasting glucose'],
        detect: (t) => /hba1c|hemoglobin\s*a1c|a1c|diabetes\s*panel|glucose\s*tolerance|fasting\s*(glucose|blood\s*sugar)/i.test(t),
        markers: ['a1c', 'hba1c', 'fasting glucose', 'blood sugar', 'glucose', 'insulin', 'c-peptide'],
        criticalFindings: [
            { pattern: /a1c.*(?:>\s*10|above\s*10)/i, message: 'Very high A1C — poorly controlled diabetes.' },
            { pattern: /glucose.*(?:>\s*400|above\s*400)/i, message: 'Critically high glucose — seek immediate care.' }
        ]
    },
    tumor_markers: {
        id: 'tumor_markers',
        name: 'Tumor Markers',
        category: 'laboratory',
        aliases: ['tumor marker', 'psa', 'cea', 'ca 125', 'ca 19-9', 'afp', 'beta-hcg', 'carcinoembryonic'],
        detect: (t) => /\bpsa\b|carcinoembryonic|cea|\bca\s*125\b|\bca\s*19.?9\b|\bafp\b|alpha.?fetoprotein|tumor\s*marker|\bbeta.?hcg\b/i.test(t),
        markers: ['psa', 'cea', 'ca 125', 'ca 19-9', 'afp', 'beta-hcg', 'ca 15-3', 'ca 27.29'],
        criticalFindings: [
            { pattern: /psa.*(?:>\s*20|above\s*20)/i, message: 'Very high PSA — urgent urological evaluation recommended.' },
            { pattern: /cea.*(?:>\s*20|above\s*20)/i, message: 'Significantly elevated CEA — further evaluation needed.' }
        ]
    },
    cardiac_enzymes: {
        id: 'cardiac_enzymes',
        name: 'Cardiac Enzymes',
        category: 'laboratory',
        aliases: ['troponin', 'ck-mb', 'bnp', 'nt-probnp', 'cardiac enzyme', 'myoglobin', 'heart enzyme'],
        detect: (t) => /troponin|ck.?mb|\bbnp\b|nt.?probnp|cardiac\s*enzyme|myoglobin/i.test(t),
        markers: ['troponin', 'troponin i', 'troponin t', 'ck-mb', 'bnp', 'nt-probnp', 'myoglobin'],
        criticalFindings: [
            { pattern: /troponin.*(?:positive|elevated|>\s*0\.04|above\s*0\.04)/i, message: 'Elevated troponin — possible heart attack. Seek emergency care immediately.' },
            { pattern: /bnp.*(?:>\s*400|above\s*400)/i, message: 'High BNP — possible heart failure.' }
        ]
    },
    coagulation: {
        id: 'coagulation',
        name: 'Coagulation Panel',
        category: 'laboratory',
        aliases: ['coagulation', 'pt', 'inr', 'aptt', 'ptt', 'prothrombin', 'clotting', 'fibrinogen', 'd-dimer'],
        detect: (t) => /coagulation|prothrombin|\bpt\b.*time|\binr\b|\baptt\b|\bptt\b|clotting|fibrinogen|d.?dimer/i.test(t),
        markers: ['pt', 'inr', 'aptt', 'ptt', 'fibrinogen', 'd-dimer', 'bleeding time', 'clotting time'],
        criticalFindings: [
            { pattern: /inr.*(?:>\s*4|above\s*4)/i, message: 'Very high INR — significant bleeding risk.' },
            { pattern: /d.?dimer.*(?:>\s*1000|above\s*1000)/i, message: 'Markedly elevated D-dimer — further evaluation for clotting needed.' }
        ]
    },
    urine: {
        id: 'urine',
        name: 'Urinalysis',
        category: 'laboratory',
        aliases: ['urinalysis', 'urine test', 'urine analysis', 'ua', 'urine culture', 'urine routine'],
        detect: (t) => /urinalysis|urine\s*(test|analysis|routine|culture)|\bua\b(?!\s*unit)/i.test(t),
        markers: ['ph', 'specific gravity', 'protein', 'glucose', 'ketones', 'blood', 'leukocyte',
                  'nitrite', 'bilirubin', 'urobilinogen', 'wbc', 'rbc', 'epithelial', 'cast', 'crystal'],
        criticalFindings: [
            { pattern: /protein.*(?:\+\+\+|\+\+\+\+|3\+|4\+)/i, message: 'Significant proteinuria — kidney evaluation recommended.' },
            { pattern: /blood.*(?:\+\+\+|\+\+\+\+)/i, message: 'Significant hematuria — further evaluation needed.' }
        ]
    },
    liver: {
        id: 'liver',
        name: 'Liver Function Test',
        category: 'laboratory',
        aliases: ['lft', 'liver function', 'liver panel', 'hepatic panel', 'liver test'],
        detect: (t) => /liver\s*function|lft|hepatic\s*panel|liver\s*(panel|test)/i.test(t),
        markers: ['alt', 'ast', 'alp', 'ggt', 'bilirubin', 'total bilirubin', 'direct bilirubin',
                  'albumin', 'total protein', 'pt', 'inr'],
        criticalFindings: [
            { pattern: /bilirubin.*(?:>\s*10|above\s*10)/i, message: 'Critically high bilirubin — possible liver failure.' },
            { pattern: /alt.*(?:>\s*500|above\s*500|ast.*(?:>\s*500|above\s*500))/i, message: 'Markedly elevated liver enzymes — possible acute liver injury.' }
        ]
    },
    vitamin: {
        id: 'vitamin',
        name: 'Vitamin & Mineral Panel',
        category: 'laboratory',
        aliases: ['vitamin d', 'vitamin b12', 'folate', 'iron studies', 'ferritin', 'calcium', 'magnesium', 'phosphorus', 'electrolyte'],
        detect: (t) => /vitamin\s*(d|b12|b6|c|b|k)|folate|iron\s*(studies|level|test)|ferritin|transferrin|magnesium|phosphorus/i.test(t),
        markers: ['vitamin d', 'vitamin b12', 'folate', 'iron', 'ferritin', 'tibc', 'transferrin',
                  'calcium', 'magnesium', 'phosphorus', 'zinc', 'selenium'],
        criticalFindings: [
            { pattern: /vitamin\s*d.*(?:<\s*10|below\s*10)/i, message: 'Severely low vitamin D.' },
            { pattern: /vitamin\s*b12.*(?:<\s*150|below\s*150)/i, message: 'Very low vitamin B12 — possible neurological risk.' }
        ]
    },
    pcr_infectious: {
        id: 'pcr_infectious',
        name: 'Infectious Disease / PCR',
        category: 'laboratory',
        aliases: ['pcr', 'covid', 'covid-19', 'rt-pcr', 'culture', 'sensitivity', 'infection test', 'hiv', 'hepatitis', 'malaria', 'dengue'],
        detect: (t) => /\brtc?[-\s]?pcr\b|covid|sars.?cov|hiv|hepatitis|malaria|dengue|culture\s*(and|&)?\s*sensitivity|infectious|serology|igg|igm/i.test(t),
        markers: ['pcr', 'igm', 'igg', 'culture', 'sensitivity', 'viral load', 'cd4', 'antigen', 'antibody'],
        criticalFindings: [
            { pattern: /hiv.*(?:positive|detected)/i, message: 'HIV positive result — confirmatory testing and specialist referral needed.' },
            { pattern: /viral\s*load.*(?:>\s*100,?000|above\s*100)/i, message: 'High viral load — medical follow-up essential.' }
        ]
    },

    // ── Radiology / Imaging ─────────────────────────────────────────────────
    xray: {
        id: 'xray',
        name: 'X-Ray Report',
        category: 'radiology',
        aliases: ['x-ray', 'xray', 'radiograph', 'chest x-ray', 'cxr', 'x ray'],
        detect: (t) => /x[-\s]?ray|radiograph|chest\s*(x[-\s]?ray|radiograph)|\bcxr\b/i.test(t),
        markers: ['impression', 'finding', 'opacity', 'consolidation', 'effusion', 'pneumothorax',
                  'cardiomegaly', 'lesion', 'fracture', 'dislocation', 'alignment'],
        criticalFindings: [
            { pattern: /pneumothorax|tension\s*pneumothorax/i, message: 'Pneumothorax detected — seek emergency care.' },
            { pattern: /mass|nodule.*(?:>\s*1\s*cm|suspicious)/i, message: 'Suspicious mass/nodule — specialist evaluation needed.' },
            { pattern: /fracture|fractures/i, message: 'Fracture detected — orthopedic evaluation needed.' },
            { pattern: /effusion.*(?:large|moderate|significant)/i, message: 'Significant pleural effusion — medical evaluation needed.' }
        ]
    },
    ct: {
        id: 'ct',
        name: 'CT Scan Report',
        category: 'radiology',
        aliases: ['ct scan', 'computed tomography', 'cat scan', 'ct', 'ct abdomen', 'ct chest', 'ct head'],
        detect: (t) => /\bct\b\s*(scan)?|computed\s*tomography|cat\s*scan|contrast.*enhanced/i.test(t),
        markers: ['impression', 'finding', 'lesion', 'mass', 'enhancement', 'attenuation', 'density',
                  'fracture', 'hemorrhage', 'edema', 'infiltrate', 'lymphadenopathy'],
        criticalFindings: [
            { pattern: /hemorrhage|bleed(ing)?|hematoma/i, message: 'Hemorrhage detected — urgent evaluation needed.' },
            { pattern: /mass.*(?:suspicious|malignant|metastatic)/i, message: 'Suspicious mass — urgent specialist referral.' },
            { pattern: /pulmonary\s*embolism|pe\b|thromboembol/i, message: 'Pulmonary embolism — seek emergency care.' },
            { pattern: /fracture|dislocat/i, message: 'Fracture or dislocation detected.' }
        ]
    },
    mri: {
        id: 'mri',
        name: 'MRI Report',
        category: 'radiology',
        aliases: ['mri', 'magnetic resonance', 'fmri', 'mr angiography', 'mra'],
        detect: (t) => /\bmri\b|magnetic\s*resonance|fmri|mra|mr\s*angiograph/i.test(t),
        markers: ['signal', 'intensity', 'enhancement', 'lesion', 'edema', 'hyperintense', 'hypointense',
                  'mass', 'defect', 'tear', 'demyelination', 'infarct'],
        criticalFindings: [
            { pattern: /acute\s*(stroke|infarct|hemorrhage)/i, message: 'Possible acute stroke — seek emergency care immediately.' },
            { pattern: /mass.*(?:suspicious|enhancing|malignant)/i, message: 'Suspicious enhancing mass — urgent evaluation.' },
            { pattern: /cord\s*(compression|transection)/i, message: 'Spinal cord compression — emergency evaluation needed.' },
            { pattern: /disc\s*herniation.*(?:large|significant|central)/i, message: 'Significant disc herniation — neurosurgical evaluation recommended.' }
        ]
    },
    ultrasound: {
        id: 'ultrasound',
        name: 'Ultrasound Report',
        category: 'radiology',
        aliases: ['ultrasound', 'sonography', 'sonogram', 'usg', 'echocardiogram', 'echo', 'doppler'],
        detect: (t) => /ultrasound|sonograph|sonogram|\busg\b|echocardiogra|doppler/i.test(t),
        markers: ['findings', 'impression', 'size', 'volume', 'echogenicity', 'flow', 'resistance',
                  'cyst', 'mass', 'calcification', 'stone', 'dilation', 'thickening'],
        criticalFindings: [
            { pattern: /ectopic\s*pregnancy/i, message: 'Possible ectopic pregnancy — seek emergency care.' },
            { pattern: /cholecystitis|gallbladder.*(?:inflamed|thickened)/i, message: 'Possible cholecystitis — medical evaluation needed.' },
            { pattern: /hydronephrosis.*(?:moderate|severe)/i, message: 'Significant hydronephrosis — urological evaluation needed.' }
        ]
    },
    ecg: {
        id: 'ecg',
        name: 'ECG / EKG Report',
        category: 'cardiology',
        aliases: ['ecg', 'ekg', 'electrocardiogram', 'electrocardiograph', 'heart rhythm'],
        detect: (t) => /\becg\b|\bekg\b|electrocardiogra|heart\s*rhythm|sinus\s*rhythm/i.test(t),
        markers: ['rate', 'rhythm', 'axis', 'pr interval', 'qrs', 'qt interval', 'st segment',
                  't wave', 'p wave', 'arrhythmia', 'sinus', 'atrial', 'ventricular'],
        criticalFindings: [
            { pattern: /st.*(?:elevation|elevated)|stemi/i, message: 'ST elevation — possible heart attack. Seek emergency care immediately.' },
            { pattern: /ventricular\s*tachycardia|vtach/i, message: 'Ventricular tachycardia — life-threatening arrhythmia. Emergency care needed.' },
            { pattern: /ventricular\s*fibrillation|vfib/i, message: 'Ventricular fibrillation — cardiac arrest. Emergency care needed.' },
            { pattern: /complete\s*heart\s*block|third\s*degree\s*block/i, message: 'Complete heart block — pacemaker evaluation needed.' },
            { pattern: /qt.*(?:>\s*500|prolonged)/i, message: 'Prolonged QT — risk of dangerous arrhythmia.' }
        ]
    },

    // ── Specialized Reports ─────────────────────────────────────────────────
    pulmonary: {
        id: 'pulmonary',
        name: 'Pulmonary Function Test',
        category: 'pulmonology',
        aliases: ['pulmonary function', 'pft', 'spirometry', 'spirometry test', 'lung function', 'fev1'],
        detect: (t) => /pulmonary\s*function|pft|spirometry|lung\s*function|fev1|fvc|peak\s*flow/i.test(t),
        markers: ['fev1', 'fvc', 'fev1/fvc', 'peak flow', 'tlc', 'dlco', 'minute ventilation', 'mvv'],
        criticalFindings: [
            { pattern: /fev1.*(?:<\s*30|below\s*30)/i, message: 'Severely reduced FEV1 — critical lung function.' },
            { pattern: /fev1\/fvc.*(?:<\s*0\.5|below\s*0\.5)/i, message: 'Severe obstruction.' }
        ]
    },
    bone_density: {
        id: 'bone_density',
        name: 'Bone Density (DEXA) Report',
        category: 'radiology',
        aliases: ['bone density', 'dexa', 'dxa', 't-score', 'z-score', 'osteoporosis'],
        detect: (t) => /bone\s*density|dexa|dxa|t[\s-]?score|osteoporosis|osteopenia/i.test(t),
        markers: ['t-score', 'z-score', 'bmd', 'bone mineral density', 'lumbar', 'femoral', 'hip'],
        criticalFindings: [
            { pattern: /t[\s-]?score.*(?:<=\s*-2\.5|below\s*-2\.5)/i, message: 'Osteoporosis range — fracture risk evaluation needed.' }
        ]
    },
    pregnancy: {
        id: 'pregnancy',
        name: 'Pregnancy / Obstetric Report',
        category: 'obstetrics',
        aliases: ['pregnancy', 'obstetric', 'prenatal', 'antenatal', 'ultrasound pregnancy', 'gestational', 'anomaly scan'],
        detect: (t) => /pregnan|obstetric|prenatal|antenatal|gestational|fetal|fetus|placenta|amniotic|trimester|nt[\s-]?scan|anomaly\s*scan/i.test(t),
        markers: ['gestational age', 'crl', 'bpd', 'hc', 'ac', 'fl', 'efw', 'placenta', 'amniotic fluid',
                  'afp', 'beta-hcg', 'nt', 'nuchal', 'anomaly', 'gender'],
        criticalFindings: [
            { pattern: /placenta\s*(previa|previa)/i, message: 'Placenta previa — obstetrician evaluation needed.' },
            { pattern: /low[\s-]?lying\s*placenta/i, message: 'Low-lying placenta — follow-up recommended.' },
            { pattern: /oligohydramnios/i, message: 'Low amniotic fluid — obstetric evaluation needed.' },
            { pattern: /polyhydramnios/i, message: 'Excess amniotic fluid — obstetric evaluation needed.' }
        ]
    },
    eye: {
        id: 'eye',
        name: 'Eye / Ophthalmology Report',
        category: 'ophthalmology',
        aliases: ['eye test', 'eye exam', 'ophthalmology', 'retinal', 'fundus', 'vision test', 'iop', 'oct', 'refraction'],
        detect: (t) => /ophthalmol|retina|fundus|visual\s*acuity|refract|optometry|eye\s*(exam|test)|iop|oct|glaucom/i.test(t),
        markers: ['visual acuity', 'va', 'iop', 'cup to disc', 'cd ratio', 'retina', 'macula',
                  'optic disc', 'refraction', 'sphere', 'cylinder', 'axis', 'pupil'],
        criticalFindings: [
            { pattern: /iop.*(?:>\s*30|above\s*30)/i, message: 'Very high eye pressure — glaucoma risk. Urgent evaluation needed.' },
            { pattern: /retinal\s*detachment/i, message: 'Retinal detachment — emergency ophthalmology care needed.' },
            { pattern: /glaucom/i, message: 'Glaucoma indicators — ophthalmologist evaluation needed.' }
        ]
    },
    ear: {
        id: 'ear',
        name: 'Ear / ENT Report',
        category: 'ent',
        aliases: ['audiometry', 'audiogram', 'hearing test', 'ent', 'ear exam', 'tympanometry', 'otoacoustic'],
        detect: (t) => /audiome|audiogram|hearing\s*test|ent|otolaryng|tympanomet|otoacoustic|ear\s*(exam|test)/i.test(t),
        markers: ['hearing level', 'db', 'frequency', 'hz', 'bone conduction', 'air conduction',
                  'tympanic', 'tympanogram', 'speech discrimination', 'srt'],
        criticalFindings: [
            { pattern: /sudden\s*(hearing\s*loss|deafness)/i, message: 'Sudden hearing loss — urgent ENT evaluation needed.' },
            { pattern: /severe.*hearing\s*loss/i, message: 'Severe hearing loss detected.' }
        ]
    },
    neurology: {
        id: 'neurology',
        name: 'Neurology Report',
        category: 'neurology',
        aliases: ['eeg', 'nerve conduction', 'emg', 'neurology', 'neurological', 'nerve study'],
        detect: (t) => /\beeg\b|nerve\s*conduction|emg|neurolog|electroencephalograph|polysomnograph|sleep\s*study/i.test(t),
        markers: ['latency', 'amplitude', 'conduction velocity', 'f wave', 'h reflex', 'motor', 'sensory',
                  'discharge', 'spike', 'wave', 'frequency', 'alpha', 'beta', 'theta', 'delta'],
        criticalFindings: [
            { pattern: /epileptiform|seizure.*discharge|spike.*wave/i, message: 'Epileptiform activity — neurology evaluation needed.' },
            { pattern: /significant.*slow(ing)?|diffuse\s*slowing/i, message: 'Diffuse slowing — possible encephalopathy.' }
        ]
    },
    histology: {
        id: 'histology',
        name: 'Histopathology / Biopsy Report',
        category: 'pathology',
        aliases: ['histopathology', 'histology', 'biopsy', 'pathology report', 'microscopy', 'tissue report'],
        detect: (t) => /histopathol|histol|biopsy|pathology\s*report|microscop|tissue\s*(exam|report)|surgical\s*path/i.test(t),
        markers: ['specimen', 'microscopy', 'histology', 'cellular', 'nuclei', 'mitosis', 'necrosis',
                  'inflammation', 'fibrosis', 'grading', 'staging', 'margin', 'invasion'],
        criticalFindings: [
            { pattern: /malignant|carcinoma|sarcoma|melanoma|lymphoma|leukemia/i, message: 'Malignancy detected — oncology referral needed.' },
            { pattern: /high[\s-]?grade|poorly\s*differentiated/i, message: 'High-grade findings — specialist evaluation needed.' },
            { pattern: /positive\s*margin|involved\s*margin/i, message: 'Positive margins — further treatment may be needed.' }
        ]
    },
    cytology: {
        id: 'cytology',
        name: 'Cytology Report',
        category: 'pathology',
        aliases: ['cytology', 'pap smear', 'pap test', 'fine needle', 'fnac', 'brush cytology'],
        detect: (t) => /cytolog|pap\s*(smear|test|coagul)|fine\s*needle|fnac|brush\s*cytol/i.test(t),
        markers: ['cells', 'nuclei', 'cytoplasm', 'atypia', 'dysplasia', 'squamous', 'glandular',
                  'inflammation', 'organism', 'ascus', 'lsil', 'hsil', 'asc-h'],
        criticalFindings: [
            { pattern: /hsil|high[\s-]?grade\s*squamous/i, message: 'High-grade squamous lesion — colposcopy recommended.' },
            { pattern: /malignant|cancer|carcinoma/i, message: 'Malignant cells detected — specialist evaluation needed.' },
            { pattern: /ascus.*(?:cannot\s*exclude|cannot\s*rule\s*out)/i, message: 'Atypical cells — follow-up recommended.' }
        ]
    },
    genetic: {
        id: 'genetic',
        name: 'Genetic / Molecular Report',
        category: 'genetics',
        aliases: ['genetic test', 'genetic panel', 'molecular', 'gene', 'mutation', 'variant', 'pgd', 'karyotype'],
        detect: (t) => /genetic\s*(test|panel|screen)|molecular\s*(test|analysis)|mutation|variant\s*(of\s*uncertainty|pathogenic)|karyotype|pgd/i.test(t),
        markers: ['variant', 'mutation', 'gene', 'chromosome', 'deletion', 'duplication', 'pathogenic',
                  'benign', 'vus', 'heterozygous', 'homozygous', 'carrier'],
        criticalFindings: [
            { pattern: /pathogenic\s*variant/i, message: 'Pathogenic variant found — genetic counseling recommended.' },
            { pattern: /high[\s-]?risk|increased\s*risk/i, message: 'Increased risk identified — discuss with specialist.' }
        ]
    },
    allergy: {
        id: 'allergy',
        name: 'Allergy Test Report',
        category: 'allergy',
        aliases: ['allergy test', 'allergy panel', 'ige', 'allergy screen', 'skin prick', 'allergy testing'],
        detect: (t) => /allergy\s*(test|panel|screen|testing)|\bige\b|skin\s*prick|allergen/i.test(t),
        markers: ['ige', 'allergen', 'specific ige', 'skin prick', 'wheal', 'flare', 'positivity', 'class'],
        criticalFindings: [
            { pattern: /class\s*[456]|(?:>\s*100\s*ku\/l|above\s*100)/i, message: 'Very high allergen sensitivity — specialist evaluation recommended.' },
            { pattern: /anaphyla|systemic\s*reaction/i, message: 'Risk of anaphylaxis — carry epinephrine and avoid trigger.' }
        ]
    },
    prescription: {
        id: 'prescription',
        name: 'Prescription',
        category: 'prescription',
        aliases: ['prescription', 'rx', 'medication list', 'drug list', 'pharmacy', 'dispensing'],
        detect: (t) => /prescription|rx\b|medication\s*(list|record)|drug\s*(list|name)|pharmacy|dispens|dosage.*form/i.test(t),
        markers: ['tablet', 'capsule', 'syrup', 'injection', 'mg', 'dose', 'twice', 'thrice', 'daily',
                  'before meal', 'after meal', ' bd', 'tid', 'od', 'hs', 'prn'],
        criticalFindings: [
            { pattern: /warfarin|heparin|doxorubicin|methotrexate/i, message: 'High-alert medication — ensure proper monitoring.' }
        ]
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Detection
// ─────────────────────────────────────────────────────────────────────────────

function detectReportType(text) {
    if (!text || typeof text !== 'string') {
        return { type: 'unknown', confidence: 0, subType: null, category: 'unknown' };
    }
    const lower = text.toLowerCase();
    const scores = [];

    for (const [id, def] of Object.entries(REPORT_TYPES)) {
        let score = 0;

        // Alias match
        for (const alias of def.aliases) {
            if (lower.includes(alias.toLowerCase())) {
                score += 30;
                break;
            }
        }

        // Keyword detect function
        if (def.detect(text)) {
            score += 20;
        }

        // Marker presence (lower threshold when alias already matched)
        let markerHits = 0;
        for (const marker of def.markers) {
            if (lower.includes(marker.toLowerCase())) {
                markerHits++;
            }
        }
        if (markerHits >= 2) {
            score += Math.min(markerHits * 5, 30);
        } else if (markerHits >= 1 && score > 0) {
            score += 5;
        }

        if (score > 0) {
            scores.push({ id, score, markerHits, confidence: Math.min(score, 100) });
        }
    }

    if (scores.length === 0) {
        return { type: 'unknown', confidence: 0, subType: null, category: 'unknown' };
    }

    scores.sort((a, b) => b.score - a.score);
    const best = scores[0];
    const def = REPORT_TYPES[best.id];

    return {
        type: best.id,
        name: def.name,
        category: def.category,
        confidence: Math.min(best.confidence, 100),
        subType: scores.length > 1 && scores[1].score > 30 ? scores[1].id : null,
        allMatches: scores.slice(0, 5)
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────────

function validateFindings(findings) {
    return findings.map(f => {
        const cleaned = { ...f };
        if (cleaned.value !== undefined && cleaned.value !== null) {
            const num = parseFloat(cleaned.value);
            if (!isNaN(num)) cleaned.value = num;
        }
        if (!cleaned.status) cleaned.status = 'check';
        if (!cleaned.name) cleaned.name = 'Unknown finding';
        if (!cleaned.explanation) cleaned.explanation = 'Please discuss this result with your healthcare provider.';
        return cleaned;
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic text-based extraction (works for all types)
// ─────────────────────────────────────────────────────────────────────────────

function genericExtract(text, reportDef) {
    const findings = [];
    const lower = text.toLowerCase();
    const lines = text.split('\n');

    // Pattern: "Test Name : Value Unit (Range)" or "Test Name Value Unit"
    const valuePattern = /^[\s\-*•]*(.{2,50}?)[\s:]+([-+]?\d+\.?\d*)\s*([a-zA-Z/%°μ²³]+(?:\/[a-zA-Z/%μ²³]+)?)/;
    const rangePattern = /(?:range|ref|reference|normal)[:\s]*([<>]?\s*\d+\.?\d*\s*[-–]\s*\d+\.?\d*)/i;
    const statusPattern = /\b(high|low|h|l|abnormal|normal|n|positive|negative|\+{1,4}|-{1,4})\b/i;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.length < 5) continue;

        const valMatch = trimmed.match(valuePattern);
        if (valMatch) {
            const name = valMatch[1].replace(/[\s:\-]+$/, '').trim();
            const value = parseFloat(valMatch[2]);
            const unit = valMatch[3];
            if (isNaN(value)) continue;

            // Find reference range
            let refRange = 'See reference range';
            const rangeMatch = trimmed.match(rangePattern);
            if (rangeMatch) {
                refRange = rangeMatch[1];
            } else {
                const dashRange = trimmed.match(/(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)/);
                if (dashRange && parseFloat(dashRange[1]) < value && value < parseFloat(dashRange[2])) {
                    refRange = dashRange[0];
                }
            }

            // Find status (look for standalone HIGH/LOW/NORMAL at end of line or after range)
            let status = 'check';
            const statusEndMatch = trimmed.match(/\b(HIGH|LOW|NORMAL|ABNORMAL|POSITIVE|NEGATIVE|H|L|N)\b\s*$/i);
            if (statusEndMatch) {
                const s = statusEndMatch[1].toUpperCase();
                if (s === 'HIGH' || s === 'H' || s === 'ABNORMAL') status = 'high';
                else if (s === 'LOW' || s === 'L') status = 'low';
                else if (s === 'NORMAL' || s === 'N') status = 'normal';
                else if (s === 'POSITIVE') status = 'positive';
                else if (s === 'NEGATIVE') status = 'normal';
            } else {
                // Also check for +/- symbols
                const symMatch = trimmed.match(/([+-]{1,4})\s*$/);
                if (symMatch) {
                    const sym = symMatch[1];
                    if (sym.startsWith('+') && sym.length >= 2) status = 'positive';
                    else if (sym === '-' || sym === '--') status = 'normal';
                }
            }

            const alreadyFound = findings.find(f => f.name.toLowerCase() === name.toLowerCase());
            if (!alreadyFound) {
                findings.push({ name, value, unit, referenceRange: refRange, status, explanation: '' });
            }
        }
    }

    return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Critical finding check
// ─────────────────────────────────────────────────────────────────────────────

function checkCritical(text, reportDef) {
    const alerts = [];
    if (!reportDef || !reportDef.criticalFindings) return alerts;
    for (const cf of reportDef.criticalFindings) {
        if (cf.pattern.test(text)) {
            // Check for negation before the match (e.g., "no pneumothorax", "without fracture")
            const match = text.match(cf.pattern);
            if (match) {
                const matchStart = text.indexOf(match[0]);
                const beforeMatch = text.substring(Math.max(0, matchStart - 30), matchStart).toLowerCase();
                const negations = /\b(no|without|absent|negative|denies|rules?\s*out|no\s*evidence)\b/i;
                if (negations.test(beforeMatch)) {
                    continue; // Skip negated findings
                }
            }
            alerts.push(cf.message);
        }
    }
    return alerts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main analysis per type
// ─────────────────────────────────────────────────────────────────────────────

function analyzeByType(text, reportType) {
    if (!text || typeof text !== 'string') {
        return {
            summary: { title: 'Report Analysis', type: reportType || 'unknown', totalFindings: 0 },
            findings: [],
            explanation: 'No readable content found in the report.',
            questionsForDoctor: ['What do my results mean?', 'Do I need follow-up testing?'],
            whenToSeekHelp: ['If you experience any new or worsening symptoms.'],
            criticalAlerts: [],
            disclaimer: '\n⚕️ This is AI-generated analysis. Always consult a qualified healthcare professional.'
        };
    }

    // Auto-detect if no type given
    const detection = reportType && REPORT_TYPES[reportType]
        ? { type: reportType, name: REPORT_TYPES[reportType].name, category: REPORT_TYPES[reportType].category }
        : detectReportType(text);

    const reportDef = REPORT_TYPES[detection.type] || null;
    const reportName = reportDef ? reportDef.name : (detection.name || 'Medical Report');

    // Extract findings
    let findings = [];
    if (reportDef) {
        findings = genericExtract(text, reportDef);
    } else {
        findings = genericExtract(text, { markers: [] });
    }
    findings = validateFindings(findings);

    // Critical alerts
    const criticalAlerts = reportDef ? checkCritical(text, reportDef) : [];

    // Abnormal counts
    const abnormal = findings.filter(f => f.status === 'high' || f.status === 'low' || f.status === 'positive');
    const normal = findings.filter(f => f.status === 'normal' || f.status === 'negative');
    const critical = findings.filter(f => f.status === 'critical');

    // Build explanation
    let explanation = '';
    if (findings.length > 0) {
        explanation += `**${reportName}** — ${findings.length} finding(s) extracted.\n\n`;
        if (abnormal.length > 0) {
            explanation += `**Abnormal values (${abnormal.length}):**\n`;
            for (const f of abnormal) {
                const icon = f.status === 'high' || f.status === 'positive' ? '⬆️' : '⬇️';
                explanation += `${icon} **${f.name}**: ${f.value} ${f.unit || ''}`;
                if (f.referenceRange) explanation += ` (Ref: ${f.referenceRange})`;
                explanation += '\n';
            }
            explanation += '\n';
        }
        if (normal.length > 0) {
            explanation += `**Normal values (${normal.length}):**\n`;
            for (const f of normal) {
                explanation += `✅ ${f.name}: ${f.value} ${f.unit || ''}\n`;
            }
            explanation += '\n';
        }
    } else {
        explanation += `**${reportName}**\n\n`;
        explanation += 'I was able to read the report but could not extract specific numeric values in a standard format. ';
        explanation += 'This may be because the report uses a non-standard layout or the text was not clearly recognized.\n\n';
    }

    if (criticalAlerts.length > 0) {
        explanation += '🚨 **Critical Findings:**\n';
        for (const alert of criticalAlerts) {
            explanation += `- ⚠️ ${alert}\n`;
        }
        explanation += '\n';
    }

    explanation += '⚕️ *This analysis is based on extracted text and general medical knowledge. It is NOT a diagnosis. ';
    explanation += 'Please review all results with your healthcare provider for proper interpretation.*';

    // Questions for doctor
    const questionsForDoctor = generateQuestionsForType(detection.type, abnormal, criticalAlerts);

    // When to seek help
    const whenToSeekHelp = generateWhenToSeekHelp(detection.type, criticalAlerts, abnormal);

    // Summary
    const summary = {
        title: reportName + ' Analysis',
        type: detection.type,
        category: detection.category || reportDef?.category || 'unknown',
        confidence: detection.confidence || 0,
        totalFindings: findings.length,
        abnormalCount: abnormal.length,
        criticalCount: critical.length,
        normalCount: normal.length
    };

    return {
        summary,
        findings,
        explanation,
        questionsForDoctor,
        whenToSeekHelp,
        criticalAlerts,
        disclaimer: '\n⚕️ This is AI-generated analysis. Always consult a qualified healthcare professional.'
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Question generators per type
// ─────────────────────────────────────────────────────────────────────────────

function generateQuestionsForType(type, abnormal, criticalAlerts) {
    const common = ['What do my results mean for my overall health?', 'When should I repeat these tests?'];
    const typeQuestions = {
        cbc: ['Do I need a differential count or peripheral smear?', 'Could medications be affecting my blood counts?'],
        cmp: ['Are my kidney and liver functions normal?', 'Do I need to adjust my diet or medications?'],
        bmp: ['Are my kidneys functioning properly?', 'Should I be concerned about electrolyte imbalances?'],
        lipid: ['What is my cardiovascular risk based on these numbers?', 'Do I need statin therapy or lifestyle changes?'],
        thyroid: ['Do I need thyroid treatment?', 'Should I see an endocrinologist?'],
        diabetes: ['Is my diabetes well controlled?', 'Do I need to adjust my insulin or oral medications?'],
        tumor_markers: ['Do these results require further investigation?', 'Should I see an oncologist?'],
        cardiac_enzymes: ['Does this indicate a heart problem?', 'Do I need a cardiac workup?'],
        coagulation: ['Is my clotting function normal?', 'Do I need to adjust blood thinners?'],
        urine: ['Do I have a urinary tract infection?', 'Do I need a kidney evaluation?'],
        liver: ['Is my liver damaged?', 'Do I need to avoid alcohol or certain medications?'],
        vitamin: ['Do I need supplements?', 'Should I change my diet?'],
        pcr_infectious: ['What does a positive result mean?', 'Do I need treatment?'],
        xray: ['Do I need additional imaging?', 'What is the next step?'],
        ct: ['Do I need a biopsy or follow-up scan?', 'What does the mass/lesion mean?'],
        mri: ['Do I need to see a specialist?', 'Are there treatment options?'],
        ultrasound: ['Do I need follow-up imaging?', 'What does this finding mean?'],
        ecg: ['Do I need a cardiology referral?', 'Are there any arrhythmia concerns?'],
        pulmonary: ['How severe is my lung disease?', 'Do I need medication adjustment?'],
        bone_density: ['Do I need osteoporosis treatment?', 'Should I take calcium and vitamin D?'],
        pregnancy: ['Is my pregnancy progressing normally?', 'Do I need additional scans?'],
        eye: ['Do I need treatment for my eyes?', 'Should I see a specialist?'],
        ear: ['Do I need hearing aids?', 'Should I see an ENT?'],
        neurology: ['Do I have epilepsy or nerve damage?', 'Do I need a neurology referral?'],
        histology: ['Is this cancerous?', 'Do I need surgery or treatment?'],
        cytology: ['Do I need a biopsy?', 'Is this pre-cancerous?'],
        genetic: ['What does this variant mean for me and my family?', 'Should my family be tested?'],
        allergy: ['How can I avoid my allergens?', 'Do I need an EpiPen?'],
        prescription: ['Are there drug interactions I should know about?', 'Are there side effects to watch for?']
    };

    const questions = [...common];
    if (typeQuestions[type]) questions.push(...typeQuestions[type]);
    if (abnormal.length > 0) {
        questions.push('What could be causing these abnormal results?');
        questions.push('Do I need additional tests?');
    }
    if (criticalAlerts.length > 0) {
        questions.push('How urgent is my situation?');
        questions.push('Should I see a specialist immediately?');
    }
    return questions;
}

function generateWhenToSeekHelp(type, criticalAlerts, abnormal) {
    const help = [];
    if (criticalAlerts.length > 0) {
        help.push('Some findings require prompt medical attention — contact your doctor as soon as possible.');
    }
    if (abnormal.length > 0) {
        help.push('If you experience any new or worsening symptoms, contact your healthcare provider.');
    }
    help.push('If you have severe chest pain, difficulty breathing, sudden weakness, or uncontrolled bleeding, seek emergency care immediately.');
    help.push('If you are unsure about any result, do not hesitate to contact your doctor.');
    return help;
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
    REPORT_TYPES,
    detectReportType,
    analyzeByType,
    genericExtract,
    validateFindings
};
