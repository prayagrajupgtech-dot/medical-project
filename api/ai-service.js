const path = require('path');
const reportTypeAnalyzer = require('./report-type-analyzer');

// ─────────────────────────────────────────────────────────────────────────────
// Medical Knowledge Base
// ─────────────────────────────────────────────────────────────────────────────
const MEDICAL_KB = {
    tests: {
        glucose: {
            name: 'Blood Glucose',
            unit: 'mg/dL',
            ranges: { normal: [70, 100], preDiabetic: [100, 126], diabetic: [126, Infinity] },
            aliases: ['glucose', 'blood glucose', 'fasting glucose', 'fasting blood glucose', 'fbg', 'blood sugar']
        },
        hemoglobin: {
            name: 'Hemoglobin',
            unit: 'g/dL',
            ranges: { low: [0, 12], normal: [12, 16], high: [16, Infinity] },
            aliases: ['hemoglobin', 'hgb', 'haemoglobin']
        },
        hemoglobin_male: {
            name: 'Hemoglobin (Male)',
            unit: 'g/dL',
            ranges: { low: [0, 14], normal: [14, 18], high: [18, Infinity] },
            aliases: ['hemoglobin male', 'hgb male']
        },
        wbc: {
            name: 'White Blood Cell Count',
            unit: '/mcL',
            ranges: { low: [0, 4000], normal: [4000, 11000], high: [11000, Infinity] },
            aliases: ['wbc', 'white blood cell', 'white blood cell count', 'leukocytes']
        },
        rbc: {
            name: 'Red Blood Cell Count',
            unit: 'million/mcL',
            ranges: { low: [0, 4.5], normal: [4.5, 5.5], high: [5.5, Infinity] },
            aliases: ['rbc', 'red blood cell', 'red blood cell count', 'erythrocytes']
        },
        cholesterol_total: {
            name: 'Total Cholesterol',
            unit: 'mg/dL',
            ranges: { desirable: [0, 200], borderline: [200, 240], high: [240, Infinity] },
            aliases: ['cholesterol', 'total cholesterol', 'serum cholesterol']
        },
        cholesterol_ldl: {
            name: 'LDL Cholesterol',
            unit: 'mg/dL',
            ranges: { optimal: [0, 100], nearOptimal: [100, 130], borderline: [130, 160], high: [160, 190], veryHigh: [190, Infinity] },
            aliases: ['ldl', 'ldl cholesterol', 'low density lipoprotein', 'bad cholesterol']
        },
        cholesterol_hdl: {
            name: 'HDL Cholesterol',
            unit: 'mg/dL',
            ranges: { low: [0, 40], normal: [40, 60], high: [60, Infinity] },
            aliases: ['hdl', 'hdl cholesterol', 'high density lipoprotein', 'good cholesterol']
        },
        triglycerides: {
            name: 'Triglycerides',
            unit: 'mg/dL',
            ranges: { normal: [0, 150], borderline: [150, 200], high: [200, 500], veryHigh: [500, Infinity] },
            aliases: ['triglycerides', 'trig', 'tg']
        },
        creatinine: {
            name: 'Creatinine',
            unit: 'mg/dL',
            ranges: { low: [0, 0.6], normal: [0.6, 1.2], high: [1.2, Infinity] },
            aliases: ['creatinine', 'serum creatinine', 'cr']
        },
        bun: {
            name: 'Blood Urea Nitrogen',
            unit: 'mg/dL',
            ranges: { low: [0, 7], normal: [7, 20], high: [20, Infinity] },
            aliases: ['bun', 'blood urea nitrogen', 'urea nitrogen']
        },
        tsh: {
            name: 'Thyroid Stimulating Hormone',
            unit: 'mIU/L',
            ranges: { low: [0, 0.4], normal: [0.4, 4.0], high: [4.0, Infinity] },
            aliases: ['tsh', 'thyroid stimulating hormone', 'thyroid stim hormone']
        },
        systolic_bp: {
            name: 'Systolic Blood Pressure',
            unit: 'mmHg',
            ranges: { low: [0, 90], normal: [90, 120], elevated: [120, 130], high_stage1: [130, 140], high_stage2: [140, 180], crisis: [180, Infinity] },
            aliases: ['systolic', 'systolic bp', 'systolic blood pressure', 'bp systolic']
        },
        diastolic_bp: {
            name: 'Diastolic Blood Pressure',
            unit: 'mmHg',
            ranges: { low: [0, 60], normal: [60, 80], high_stage1: [80, 90], high_stage2: [90, Infinity] },
            aliases: ['diastolic', 'diastolic bp', 'diastolic blood pressure', 'bp diastolic']
        },
        bmi: {
            name: 'Body Mass Index',
            unit: 'kg/m²',
            ranges: { underweight: [0, 18.5], normal: [18.5, 25], overweight: [25, 30], obese: [30, Infinity] },
            aliases: ['bmi', 'body mass index']
        },
        hemoglobin_a1c: {
            name: 'Hemoglobin A1c',
            unit: '%',
            ranges: { normal: [0, 5.7], preDiabetic: [5.7, 6.5], diabetic: [6.5, Infinity] },
            aliases: ['a1c', 'hba1c', 'hemoglobin a1c', 'glycated hemoglobin']
        },
        platelets: {
            name: 'Platelet Count',
            unit: '/mcL',
            ranges: { low: [0, 150000], normal: [150000, 400000], high: [400000, Infinity] },
            aliases: ['platelets', 'platelet count', 'plt']
        },
        alt: {
            name: 'Alanine Aminotransferase',
            unit: 'U/L',
            ranges: { normal: [0, 40], high: [40, Infinity] },
            aliases: ['alt', 'alanine aminotransferase', 'sgpt']
        },
        ast: {
            name: 'Aspartate Aminotransferase',
            unit: 'U/L',
            ranges: { normal: [0, 40], high: [40, Infinity] },
            aliases: ['ast', 'aspartate aminotransferase', 'sgot']
        },
        vitamin_d: {
            name: 'Vitamin D',
            unit: 'ng/mL',
            ranges: { deficient: [0, 20], insufficient: [20, 30], normal: [30, 100], high: [100, Infinity] },
            aliases: ['vitamin d', 'vit d', '25-hydroxyvitamin d']
        }
    },

    emergencyKeywords: [
        'chest pain', 'heart attack', 'difficulty breathing', 'shortness of breath',
        'choking', 'stroke', 'face drooping', 'arm weakness', 'speech difficulty',
        'severe bleeding', 'uncontrolled bleeding', 'allergic reaction', 'anaphylaxis',
        'loss of consciousness', 'unconscious', 'seizure', 'seizures', 'convulsion',
        'severe burns', 'poisoning', 'overdose', 'suicidal', 'want to die',
        'kill myself', 'end my life', 'no reason to live', 'severe headache',
        'worst headache', 'thunderclap headache', 'paralysis', 'numbness on one side',
        'vision loss', 'slurred speech', 'confusion sudden', 'trouble walking',
        'coughing blood', 'vomiting blood', 'blood in stool', 'black stool',
        'high fever', 'stiff neck', 'abdominal pain severe', 'cant breathe',
        'cant stop bleeding', 'passing out', 'fainting', 'collapse',
        'drug reaction', 'toxic ingestion', 'carbon monoxide', 'drowning',
        'electric shock', 'severe allergic', 'swelling throat', 'tongue swelling',
        'cant swallow', 'blue lips', 'blue face', 'unresponsive'
    ],

    symptomPatterns: {
        respiratory: ['cough', 'shortness of breath', 'wheezing', 'chest tightness', 'nasal congestion', 'runny nose', 'sore throat'],
        cardiovascular: ['chest pain', 'palpitations', 'irregular heartbeat', 'swollen legs', 'ankle swelling', 'dizziness'],
        neurological: ['headache', 'migraine', 'numbness', 'tingling', 'weakness', 'confusion', 'memory loss', 'dizziness', 'balance problems'],
        gastrointestinal: ['nausea', 'vomiting', 'diarrhea', 'constipation', 'abdominal pain', 'bloating', 'heartburn', 'indigestion'],
        musculoskeletal: ['joint pain', 'back pain', 'muscle pain', 'stiffness', 'swelling', 'limited movement'],
        dermatological: ['rash', 'itching', 'redness', 'swelling', 'bumps', 'dry skin', 'hives', 'bruising'],
        psychiatric: ['anxiety', 'depression', 'insomnia', 'fatigue', 'mood changes', 'panic', 'stress'],
        general: ['fever', 'chills', 'fatigue', 'weight loss', 'weight gain', 'night sweats', 'appetite changes']
    },

    medicalTerms: {
        'hypertension': 'High blood pressure - a condition where blood pressure is consistently elevated',
        'hypotension': 'Low blood pressure - a condition where blood pressure is consistently below normal',
        'hyperglycemia': 'High blood sugar - elevated glucose levels in the blood',
        'hypoglycemia': 'Low blood sugar - glucose levels in the blood that are too low',
        'anemia': 'A condition where you lack enough healthy red blood cells to carry adequate oxygen to your body\'s tissues',
        'leukocytosis': 'An elevated white blood cell count, often indicating infection or inflammation',
        'leukopenia': 'A low white blood cell count, which may indicate a weakened immune system',
        'thrombocytopenia': 'A low platelet count, which can affect blood clotting',
        'hyperlipidemia': 'Elevated levels of fats (lipids) in the blood, including cholesterol and triglycerides',
        'hypothyroidism': 'An underactive thyroid gland that doesn\'t produce enough thyroid hormones',
        'hyperthyroidism': 'An overactive thyroid gland that produces too much thyroid hormone',
        'azotemia': 'Elevated levels of nitrogen waste products in the blood, possibly indicating kidney problems',
        'hepatomegaly': 'Enlargement of the liver',
        'splenomegaly': 'Enlargement of the spleen',
        'edema': 'Swelling caused by excess fluid trapped in your body\'s tissues',
        'dyspnea': 'Difficulty breathing or shortness of breath',
        'tachycardia': 'A heart rate that exceeds the normal resting rate (usually over 100 beats per minute)',
        'bradycardia': 'A heart rate that is slower than normal (usually under 60 beats per minute)',
        'arrhythmia': 'An irregular heartbeat or heart rhythm',
        'murmur': 'A whooshing or swishing sound heard during a heartbeat, which may indicate a heart valve problem',
        'lesion': 'An area of abnormal tissue change in the body',
        'benign': 'Not cancerous - a growth that does not spread to other parts of the body',
        'malignant': 'Cancerous - a growth that can invade nearby tissues and spread to other parts of the body',
        'metastasis': 'The spread of cancer cells from the place where they first formed to another part of the body',
        'inflammation': 'The body\'s response to injury or infection, characterized by redness, swelling, heat, and pain',
        'infection': 'The invasion and growth of germs (bacteria, viruses, yeast, or other organisms) in the body',
        'chronic': 'A condition that lasts for a long time or keeps coming back',
        'acute': 'A condition that comes on suddenly and lasts for a short time',
        'prognosis': 'The likely course of a disease or ailment',
        'differential diagnosis': 'A list of possible conditions that could be causing your symptoms',
        'idiopathic': 'Having no known cause',
        'asymptomatic': 'Having no symptoms',
        'bilateral': 'Affecting both sides of the body',
        'unilateral': 'Affecting one side of the body',
        'posterior': 'Toward the back of the body',
        'anterior': 'Toward the front of the body',
        'distal': 'Away from the center of the body',
        'proximal': 'Close to the center of the body'
    }
};

const DISCLAIMER = '\n\n⚕️ *I\'m Shrijal, an AI medical assistant. I provide general health information only. This is not a substitute for professional medical advice, diagnosis, or treatment. Always consult a qualified healthcare professional for medical decisions.*';

const EMERGENCY_DISCLAIMER = 'This information is NOT a substitute for professional medical advice. ' +
    'If you believe you or someone else is experiencing a medical emergency, call emergency services immediately.';

// ─────────────────────────────────────────────────────────────────────────────
// Helper Utilities
// ─────────────────────────────────────────────────────────────────────────────

function extractNumbersWithUnits(text) {
    const patterns = [
        /(\d+\.?\d*)\s*(mg\/dL|g\/dL|\/mcL|million\/mcL|mmHg|kg\/m[²2]|mIU\/U|U\/L|ng\/mL|%)/gi,
        /(\d+\.?\d*)\s*(mg\/dl|g\/dl|\/uL|mmhg|iu\/ml)/gi
    ];
    const results = [];
    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            results.push({
                value: parseFloat(match[1]),
                unit: match[2],
                raw: match[0]
            });
        }
    }
    return results;
}

function findMatchingTest(nameFragment) {
    const lower = nameFragment.toLowerCase().trim();
    for (const [key, test] of Object.entries(MEDICAL_KB.tests)) {
        for (const alias of test.aliases) {
            if (lower.includes(alias) || alias.includes(lower)) {
                return { key, ...test };
            }
        }
    }
    return null;
}

function getStatusForValue(test, value) {
    const ranges = test.ranges;
    if (ranges.normal && value >= ranges.normal[0] && value < ranges.normal[1]) return 'normal';
    if (ranges.desirable && value >= ranges.desirable[0] && value < ranges.desirable[1]) return 'normal';
    if (ranges.optimal && value >= ranges.optimal[0] && value < ranges.optimal[1]) return 'normal';
    if (ranges.low && value >= ranges.low[0] && value < ranges.low[1]) return 'low';
    if (ranges.deficient && value >= ranges.deficient[0] && value < ranges.deficient[1]) return 'low';
    if (ranges.underweight && value >= ranges.underweight[0] && value < ranges.underweight[1]) return 'low';
    if (ranges.preDiabetic && value >= ranges.preDiabetic[0] && value < ranges.preDiabetic[1]) return 'high';
    if (ranges.diabetic && value >= ranges.diabetic[0] && value < ranges.diabetic[1]) return 'critical';
    if (ranges.borderline && value >= ranges.borderline[0] && value < ranges.borderline[1]) return 'high';
    if (ranges.high && value >= ranges.high[0]) return 'high';
    if (ranges.veryHigh && value >= ranges.veryHigh[0]) return 'critical';
    if (ranges.elevated && value >= ranges.elevated[0] && value < ranges.elevated[1]) return 'high';
    if (ranges.high_stage1 && value >= ranges.high_stage1[0] && value < ranges.high_stage1[1]) return 'high';
    if (ranges.high_stage2 && value >= ranges.high_stage2[0]) return 'critical';
    if (ranges.crisis && value >= ranges.crisis[0]) return 'critical';
    if (ranges.overweight && value >= ranges.overweight[0] && value < ranges.overweight[1]) return 'high';
    if (ranges.obese && value >= ranges.obese[0]) return 'critical';
    if (ranges.insufficient && value >= ranges.insufficient[0] && value < ranges.insufficient[1]) return 'low';
    if (ranges.nearOptimal && value >= ranges.nearOptimal[0] && value < ranges.nearOptimal[1]) return 'high';
    if (ranges.normal && value < ranges.normal[0]) return 'low';
    return 'normal';
}

function getStatusExplanation(test, status) {
    const explanations = {
        normal: `${test.name} is within the normal range.`,
        low: `${test.name} is below the normal range. This could indicate various conditions that should be discussed with your doctor.`,
        high: `${test.name} is above the normal range. This could indicate various conditions that should be discussed with your doctor.`,
        critical: `${test.name} is significantly outside the normal range and warrants prompt medical attention.`
    };
    return explanations[status] || `Status of ${test.name} requires medical interpretation.`;
}

function getQuestionsForDoctor(findings) {
    const questions = [];
    const abnormalFindings = findings.filter(f => f.status !== 'normal');

    if (abnormalFindings.length === 0) {
        questions.push('Are my results all within healthy ranges for someone with my medical history?');
        questions.push('How often should I have these tests repeated?');
        return questions;
    }

    questions.push('What could be causing my abnormal results?');
    questions.push('Do I need any additional tests to investigate further?');

    const hasHigh = abnormalFindings.some(f => f.status === 'high' || f.status === 'critical');
    const hasLow = abnormalFindings.some(f => f.status === 'low');

    if (hasHigh) {
        questions.push('Are there lifestyle changes I should make to address my elevated values?');
        questions.push('Do I need medication for these results?');
    }

    if (hasLow) {
        questions.push('What could be causing my low values and what can I do about it?');
        questions.push('Should I consider supplements or dietary changes?');
    }

    const hasCritical = abnormalFindings.some(f => f.status === 'critical');
    if (hasCritical) {
        questions.push('How urgent is it that I address these results?');
        questions.push('Should I see a specialist?');
    }

    questions.push('What follow-up testing do you recommend?');
    questions.push('When should I schedule my next appointment to review these results?');

    return questions;
}

function getWhenToSeekHelp(findings) {
    const indicators = [];
    const criticalFindings = findings.filter(f => f.status === 'critical');

    if (criticalFindings.length > 0) {
        indicators.push('One or more of your results are significantly abnormal and you should contact your doctor promptly.');
    }

    indicators.push('Seek immediate medical attention if you experience severe symptoms such as chest pain, difficulty breathing, sudden severe headache, or loss of consciousness.');
    indicators.push('If your symptoms worsen or new symptoms develop, contact your healthcare provider.');
    indicators.push('If you have any concerns about your results, do not hesitate to contact your doctor.');

    return indicators;
}

// ─────────────────────────────────────────────────────────────────────────────
// analyzeReport
// ─────────────────────────────────────────────────────────────────────────────

function analyzeReport(fileContent, fileType, reportType, preExtractedTests) {
    if (!fileContent && !preExtractedTests) {
        return {
            error: 'No file content provided or content is not text.',
            disclaimer: DISCLAIMER
        };
    }

    const findings = [];

    // If pre-extracted tests are provided (from OCR pipeline), use them directly
    if (preExtractedTests && Array.isArray(preExtractedTests) && preExtractedTests.length > 0) {
        for (const test of preExtractedTests) {
            const value = parseFloat(test.value);
            if (isNaN(value)) continue;

            // Use the status from OCR extraction if available
            let status = test.status || 'check';

            // If status is 'check', try to determine from KB
            if (status === 'check') {
                const kbTest = findMatchingTest(test.name);
                if (kbTest) {
                    status = getStatusForValue(kbTest, value);
                }
            }

            findings.push({
                name: test.name,
                value: value,
                unit: test.unit || '',
                range: test.referenceRange || 'See reference range',
                status: status,
                explanation: getStatusExplanation({ name: test.name }, status),
                confidence: test.confidence || 'high'
            });
        }
    } else {
        // Fallback: extract from text using regex (original behavior)
        const text = fileContent || '';
        const numericValues = extractNumbersWithUnits(text);

    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase();
        for (const [key, test] of Object.entries(MEDICAL_KB.tests)) {
            for (const alias of test.aliases) {
                if (line.includes(alias)) {
                    const lineNumbers = line.match(/(\d+\.?\d*)/g);
                    if (lineNumbers && lineNumbers.length > 0) {
                        const value = parseFloat(lineNumbers[lineNumbers.length - 1]);
                        if (!isNaN(value) && value > 0) {
                            const alreadyFound = findings.find(f =>
                                f.name === test.name &&
                                Math.abs(f.value - value) < 0.001
                            );
                            if (!alreadyFound) {
                                const status = getStatusForValue(test, value);
                                findings.push({
                                    name: test.name,
                                    value: value,
                                    unit: test.unit,
                                    range: `${test.ranges.normal ? test.ranges.normal[0] + '-' + test.ranges.normal[1] : 'See reference range'}`,
                                    status: status,
                                    explanation: getStatusExplanation(test, status)
                                });
                            }
                        }
                    }
                    break;
                }
            }
        }
    }

    for (const nv of numericValues) {
        const test = findMatchingTest(nv.raw);
        if (test) {
            const alreadyFound = findings.find(f =>
                f.name === test.name &&
                Math.abs(f.value - nv.value) < 0.001
            );
            if (!alreadyFound) {
                const status = getStatusForValue(test, nv.value);
                const normalRange = test.ranges.normal || test.ranges.desirable || test.ranges.optimal;
                findings.push({
                    name: test.name,
                    value: nv.value,
                    unit: test.unit,
                    range: normalRange ? `${normalRange[0]}-${normalRange[1]}` : 'See reference range',
                    status: status,
                    explanation: getStatusExplanation(test, status)
                });
            }
        }
    }

    const bpSystolicLine = lines.find(l => /systolic|bp.*sys|sys.*bp/i.test(l));
    const bpDiastolicLine = lines.find(l => /diastolic|bp.*dia|dia.*bp/i.test(l));
    const bpGeneralLine = !bpSystolicLine ? lines.find(l => /blood\s*pressure|bp\s*:|bp\s*=|\bbp\b/i.test(l)) : null;
    if (bpSystolicLine || bpGeneralLine) {
        const bpLine = bpSystolicLine || bpGeneralLine;
        const match = bpLine.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
        if (match) {
            const sysVal = parseInt(match[1]);
            const diaVal = parseInt(match[2]);
            const sysTest = MEDICAL_KB.tests.systolic_bp;
            const diaTest = MEDICAL_KB.tests.diastolic_bp;
            const sysStatus = getStatusForValue(sysTest, sysVal);
            const diaStatus = getStatusForValue(diaTest, diaVal);
            const overallStatus = sysStatus === 'critical' || diaStatus === 'critical' ? 'critical' :
                sysStatus === 'high' || diaStatus === 'high' ? 'high' :
                sysStatus === 'normal' && diaStatus === 'normal' ? 'normal' : 'low';
            findings.push({
                name: 'Blood Pressure',
                value: `${sysVal}/${diaVal}`,
                unit: 'mmHg',
                range: '<120/80',
                status: overallStatus,
                explanation: getStatusExplanation({ name: 'Blood Pressure', ranges: { normal: [0, 120] } }, overallStatus)
            });
        }
    }
    } // end else (fallback text extraction)

    const abnormalCount = findings.filter(f => f.status !== 'normal').length;
    const criticalCount = findings.filter(f => f.status === 'critical').length;

    // ── Multi-modal report analysis (for non-lab report types) ─────────────
    // If few or no lab-style findings were extracted, try the specialized analyzer
    const reportTypeDetection = reportTypeAnalyzer.detectReportType(fileContent || '');
    let specializedAnalysis = null;
    if (reportTypeDetection.type !== 'unknown' && reportTypeDetection.type !== 'prescription' && findings.length < 3) {
        specializedAnalysis = reportTypeAnalyzer.analyzeByType(fileContent, reportTypeDetection.type);
    }

    let summaryTitle = 'Medical Report Analysis';
    if (reportType) {
        summaryTitle = reportType.charAt(0).toUpperCase() + reportType.slice(1) + ' Report Analysis';
    } else if (specializedAnalysis) {
        summaryTitle = specializedAnalysis.summary.title;
    } else if (fileType) {
        if (fileType.includes('pdf')) summaryTitle = 'PDF Medical Report Analysis';
        else if (fileType.includes('image')) summaryTitle = 'Image Medical Report Analysis';
        else if (fileType.includes('text')) summaryTitle = 'Text Medical Report Analysis';
    }

    const explanation = findings.length > 0
        ? `I analyzed your medical report and found ${findings.length} test value(s). ` +
          `${abnormalCount === 0 ? 'All values appear to be within normal ranges.' :
            `${abnormalCount} value(s) are outside normal ranges${criticalCount > 0 ? ', including ' + criticalCount + ' that are significantly abnormal' : ''}. ` +
            'This analysis is based on general reference ranges and may not account for your individual health circumstances. Please review these results with your healthcare provider.'}`
        : 'I was unable to extract specific test values from the provided content. ' +
          'This could be because the text was not clearly formatted, the report uses non-standard formatting, ' +
          'or the content may be an image that needs OCR processing. ' +
          'Please provide the content in a clear text format or consult your healthcare provider for interpretation.';

    const concerns = [];
    if (criticalCount > 0) {
        concerns.push('Some results are significantly outside normal ranges and may require prompt medical attention.');
    }
    if (abnormalCount > criticalCount) {
        concerns.push('Some results are outside normal ranges and should be discussed with your doctor.');
    }
    if (findings.length === 0) {
        concerns.push('No test values could be extracted from the provided content.');
    }
    concerns.push('Reference ranges may vary between laboratories and do not account for individual factors such as age, sex, medications, or medical history.');
    concerns.push('Abnormal results do not necessarily indicate a medical condition and should be interpreted by a qualified healthcare professional.');

    const summary = {
        title: summaryTitle,
        date: new Date().toISOString().split('T')[0],
        type: fileType || 'Unknown',
        totalValues: findings.length,
        abnormalValues: abnormalCount,
        criticalValues: criticalCount
    };

    return {
        summary,
        findings: specializedAnalysis ? (specializedAnalysis.findings.length > 0 ? specializedAnalysis.findings : findings) : findings,
        explanation: specializedAnalysis ? specializedAnalysis.explanation : explanation,
        concerns: specializedAnalysis ? (specializedAnalysis.criticalAlerts.length > 0 ? specializedAnalysis.criticalAlerts : concerns) : concerns,
        questionsForDoctor: specializedAnalysis ? specializedAnalysis.questionsForDoctor : getQuestionsForDoctor(findings),
        whenToSeekHelp: specializedAnalysis ? specializedAnalysis.whenToSeekHelp : getWhenToSeekHelp(findings),
        reportType: reportTypeDetection.type !== 'unknown' ? reportTypeDetection : null,
        disclaimer: DISCLAIMER
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// analyzeSymptomPhoto
// ─────────────────────────────────────────────────────────────────────────────

function analyzeSymptomPhoto(description) {
    if (!description || typeof description !== 'string') {
        return {
            error: 'No description provided.',
            disclaimer: DISCLAIMER
        };
    }

    const lowerDesc = description.toLowerCase();
    const visibleObservations = [];
    const possibleConditions = [];
    const warningSigns = [];
    const recommendations = [];

    const observationPatterns = [
        { pattern: /red(ness)?|erythema|inflamed/i, observation: 'Redness or erythema observed' },
        { pattern: /swell(ed|ing)?|edema|puff(y|iness)/i, observation: 'Swelling or edema observed' },
        { pattern: /rash| eruption | spots? | lesions? /i, observation: 'Rash or skin eruption observed' },
        { pattern: /bruise|ecchymosis|contusion/i, observation: 'Bruising or discoloration observed' },
        { pattern: /cut|laceration|incision|wound/i, observation: 'Cut or wound observed' },
        { pattern: /burn|scald|blister/i, observation: 'Burn or blister observed' },
        { pattern: /bump|nodule|lump|mass/i, observation: 'Bump, nodule, or lump observed' },
        { pattern: /discharg|pus|exudate/i, observation: 'Discharge or exudate observed' },
        { pattern: /scab|crust|dried/i, observation: 'Scabbing or crusting observed' },
        { pattern: /swollen|puffy|edematous/i, observation: 'Swelling observed' },
        { pattern: /pale|pallor|white/i, observation: 'Paleness or pallor observed' },
        { pattern: /blue|cyanotic|bluish/i, observation: 'Bluish discoloration (cyanosis) observed' },
        { pattern: /yellow|jaundice|icteric/i, observation: 'Yellow discoloration (possible jaundice) observed' },
        { pattern: /dry|flaky|scaling/i, observation: 'Dry or flaky skin observed' },
        { pattern: /wet|moist/i, observation: 'Moisture or wetness observed' },
        { pattern: /bleed(ing)?/i, observation: 'Bleeding observed' },
        { pattern: /swollen lymph|lymph node/i, observation: 'Possible lymph node swelling observed' },
        { pattern: /crack|fissure/i, observation: 'Skin cracking or fissure observed' },
        { pattern: /hives|urticaria/i, observation: 'Hives or urticaria observed' }
    ];

    for (const { pattern, observation } of observationPatterns) {
        if (pattern.test(description)) {
            visibleObservations.push(observation);
        }
    }

    if (visibleObservations.length === 0) {
        visibleObservations.push('General observation noted from description');
    }

    const conditionMappings = [
        {
            patterns: [/rash|red.*spots?|hives|urticaria/i],
            condition: 'Possible allergic reaction or dermatitis',
            likelihood: 'possible',
            explanation: 'Redness and rash-like appearance could suggest an allergic reaction, contact dermatitis, or other inflammatory skin condition. A healthcare provider can perform appropriate testing.'
        },
        {
            patterns: [/swollen|puff|edema|inflamed/i],
            condition: 'Possible inflammation or fluid retention',
            likelihood: 'possible',
            explanation: 'Swelling can be caused by injury, infection, allergic reaction, or fluid retention. The underlying cause requires medical evaluation.'
        },
        {
            patterns: [/bruise|ecchymosis|purple|blue.*patch/i],
            condition: 'Possible contusion or bruising',
            likelihood: 'possible',
            explanation: 'Bruising indicates bleeding under the skin, which can result from trauma, blood clotting issues, or other medical conditions.'
        },
        {
            patterns: [/cut|laceration|wound|open/i],
            condition: 'Possible wound or laceration',
            likelihood: 'possible',
            explanation: 'An open wound or cut requires proper cleaning and care. Deep or infected wounds need medical attention.'
        },
        {
            patterns: [/burn|blister|scald/i],
            condition: 'Possible burn injury',
            likelihood: 'possible',
            explanation: 'Burns require appropriate first aid and medical evaluation depending on severity, size, and depth.'
        },
        {
            patterns: [/bump|nodule|lump|mass|growth/i],
            condition: 'Possible skin growth or nodule',
            likelihood: 'possible',
            explanation: 'Skin bumps or lumps can be benign (like cysts or lipomas) or may require evaluation to rule out other conditions.'
        },
        {
            patterns: [/discharg|pus|infected|yellow.*crust/i],
            condition: 'Possible skin infection',
            likelihood: 'possible',
            explanation: 'Discharge or pus can indicate bacterial infection, which may require medical treatment including possible antibiotics.'
        },
        {
            patterns: [/yellow|jaundice|icteric/i],
            condition: 'Possible jaundice or liver-related discoloration',
            likelihood: 'possible',
            explanation: 'Yellowing of the skin or eyes can indicate liver problems, bile duct obstruction, or hemolytic conditions. Requires medical evaluation.'
        },
        {
            patterns: [/blue|cyanotic|bluish|lips.*blue/i],
            condition: 'Possible cyanosis',
            likelihood: 'possible',
            explanation: 'Bluish discoloration can indicate reduced oxygen in the blood, which can be a sign of respiratory or cardiac issues. Requires prompt medical attention.'
        }
    ];

    for (const mapping of conditionMappings) {
        for (const pattern of mapping.patterns) {
            if (pattern.test(description)) {
                const alreadyFound = possibleConditions.find(c => c.condition === mapping.condition);
                if (!alreadyFound) {
                    possibleConditions.push({
                        condition: mapping.condition,
                        likelihood: mapping.likelihood,
                        explanation: mapping.explanation
                    });
                }
                break;
            }
        }
    }

    if (possibleConditions.length === 0) {
        possibleConditions.push({
            condition: 'Unable to determine specific condition from description',
            likelihood: 'possible',
            explanation: 'The description does not match common patterns. A healthcare provider should evaluate the area for accurate assessment.'
        });
    }

    const emergencyPatterns = [
        { pattern: /blue|cyanotic|cant breathe|difficulty breathing/i, sign: 'Bluish discoloration (cyanosis) - may indicate oxygen deprivation' },
        { pattern: /severe bleed|uncontrolled|gushing|arterial/i, sign: 'Severe or uncontrolled bleeding' },
        { pattern: /large burn|burn.*face|burn.*airway|extensive/i, sign: 'Large or severe burn requiring emergency care' },
        { pattern: /anaphyla|throat.*swell|tongue.*swell|cant breathe.*allergic/i, sign: 'Possible anaphylaxis - life-threatening allergic reaction' },
        { pattern: /open fracture|bone.*visible|deformity.*accident/i, sign: 'Possible open fracture requiring emergency care' },
        { pattern: /infected.*spread|red.*streak|fever.*wound/i, sign: 'Spreading infection that may require urgent treatment' },
        { pattern: /severe.*pain|unbearable|intolerable/i, sign: 'Severe pain that requires medical evaluation' }
    ];

    for (const { pattern, sign } of emergencyPatterns) {
        if (pattern.test(description)) {
            warningSigns.push(sign);
        }
    }

    if (warningSigns.length === 0) {
        warningSigns.push('Monitor for worsening symptoms including increased pain, swelling, redness, warmth, fever, or discharge.');
    }

    if (warningSigns.length > 0) {
        warningSigns.push('Seek immediate medical attention if you notice any of these warning signs.');
    }

    recommendations.push('Keep the affected area clean and dry.');
    recommendations.push('Avoid touching or scratching the area to prevent further irritation or infection.');
    recommendations.push('Take photographs over time to track any changes.');
    recommendations.push('Consult a healthcare provider for a proper examination and diagnosis.');
    recommendations.push('If symptoms worsen, spread, or are accompanied by fever, seek medical attention promptly.');

    if (visibleObservations.some(o => /wound|cut|laceration/i.test(o))) {
        recommendations.push('Clean any open wounds gently with clean water and cover with a sterile bandage.');
    }
    if (visibleObservations.some(o => /burn|blister/i.test(o))) {
        recommendations.push('For burns, cool the area with lukewarm (not cold) running water for 10-20 minutes. Do not apply ice or butter.');
    }
    if (visibleObservations.some(o => /swelling|swollen/i.test(o))) {
        recommendations.push('Elevate the affected area if possible to help reduce swelling.');
    }

    const whenToSeekHelp = [
        'Seek immediate emergency care if you experience difficulty breathing, chest pain, or signs of anaphylaxis.',
        'Go to the emergency room if you have severe bleeding that cannot be controlled with direct pressure.',
        'Contact your healthcare provider promptly if the condition worsens, spreads, or is accompanied by fever.',
        'Seek medical attention if the area shows signs of infection (increasing redness, warmth, pus, red streaking, or fever).',
        'If you are unsure about the severity of your condition, it is always safer to consult a healthcare professional.'
    ];

    return {
        visibleObservations,
        possibleConditions,
        warningSigns,
        recommendations,
        whenToSeekHelp,
        disclaimer: DISCLAIMER
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// analyzeText
// ─────────────────────────────────────────────────────────────────────────────

function analyzeText(text) {
    if (!text || typeof text !== 'string') {
        return {
            error: 'No text provided for analysis.',
            disclaimer: DISCLAIMER
        };
    }

    const lowerText = text.toLowerCase();
    const emergencyFlags = [];
    const symptomPatterns = [];
    const termExplanations = [];
    const recommendations = [];

    for (const keyword of MEDICAL_KB.emergencyKeywords) {
        if (lowerText.includes(keyword.toLowerCase())) {
            emergencyFlags.push(keyword);
        }
    }

    const strokePatterns = [
        /face\s*(droop|drooping|numb|tingle|one\s*side)/i,
        /arm\s*(weak|weakness|numb|tingle|heavy|fall)/i,
        /speech\s*(difficult|slur|slurred| trouble)/i,
        /sudden\s*(confusion|numbness|weakness|vision|trouble\s*walk)/i,
        /fast\s*.*face.*arm.*speech/i
    ];

    for (const pattern of strokePatterns) {
        if (pattern.test(text)) {
            emergencyFlags.push('Possible stroke symptoms detected (FAST indicators)');
            break;
        }
    }

    const heartPatterns = [
        /chest\s*pain/i,
        /heart\s*attack/i,
        /pressure.*chest/i,
        /pain.*left\s*arm/i,
        /pain.*jaw/i,
        /shortness.*breath.*chest/i
    ];

    for (const pattern of heartPatterns) {
        if (pattern.test(text)) {
            emergencyFlags.push('Possible cardiac symptoms detected');
            break;
        }
    }

    const breathingPatterns = [
        /cant\s*breathe|cannot\s*breathe|unable\s*to\s*breathe/i,
        /difficulty\s*breathe|trouble\s*breathe|hard\s*to\s*breathe/i,
        /shortness\s*of\s*breath|sob/i,
        /choking|throat.*clos/i
    ];

    for (const pattern of breathingPatterns) {
        if (pattern.test(text)) {
            emergencyFlags.push('Possible respiratory distress detected');
            break;
        }
    }

    for (const [category, patterns] of Object.entries(MEDICAL_KB.symptomPatterns)) {
        for (const symptom of patterns) {
            if (lowerText.includes(symptom)) {
                const existing = symptomPatterns.find(sp => sp.category === category);
                if (existing) {
                    if (!existing.symptoms.includes(symptom)) {
                        existing.symptoms.push(symptom);
                    }
                } else {
                    symptomPatterns.push({ category, symptoms: [symptom] });
                }
            }
        }
    }

    for (const [term, explanation] of Object.entries(MEDICAL_KB.medicalTerms)) {
        const wordBoundary = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (wordBoundary.test(text)) {
            termExplanations.push({ term, explanation });
        }
    }

    if (symptomPatterns.length > 0) {
        const categories = symptomPatterns.map(sp => sp.category);
        const uniqueCategories = [...new Set(categories)];

        recommendations.push(`Your description mentions symptoms related to: ${uniqueCategories.join(', ')}.`);
        recommendations.push('Please provide more details about when these symptoms started, their severity, and any triggers.');
        recommendations.push('Consider keeping a symptom diary to track patterns and triggers.');

        if (uniqueCategories.includes('cardiovascular') || uniqueCategories.includes('respiratory')) {
            recommendations.push('Cardiovascular and respiratory symptoms should be evaluated by a healthcare provider promptly.');
        }
        if (uniqueCategories.includes('neurological')) {
            recommendations.push('Neurological symptoms should be assessed by a healthcare provider, especially if sudden or severe.');
        }
    } else {
        recommendations.push('Please provide more specific details about your symptoms for a more targeted analysis.');
    }

    recommendations.push('Always consult a qualified healthcare provider for proper diagnosis and treatment.');
    recommendations.push('If your symptoms are severe, worsening, or accompanied by emergency symptoms, seek immediate medical attention.');

    const isEmergency = emergencyFlags.length > 0;
    const response = {
        isEmergency,
        emergencyFlags,
        symptomPatterns,
        termExplanations: termExplanations.length > 0 ? termExplanations : undefined,
        recommendations,
        disclaimer: DISCLAIMER
    };

    if (isEmergency) {
        response.emergencyAdvice = EMERGENCY_DISCLAIMER;
        response.severity = emergencyFlags.length >= 2 ? 'high' : 'medium';
        response.urgencyMessage = 'Based on the keywords detected in your message, you may be experiencing symptoms that require immediate medical attention. Please call your local emergency number or go to the nearest emergency room.';
    }

    return response;
}

// ─────────────────────────────────────────────────────────────────────────────
// detectEmergency
// ─────────────────────────────────────────────────────────────────────────────

function detectEmergency(text) {
    if (!text || typeof text !== 'string') {
        return {
            isEmergency: false,
            severity: 'low',
            message: 'No text provided for emergency detection.',
            advice: 'If you are experiencing a medical emergency, please call your local emergency number immediately.',
            disclaimer: EMERGENCY_DISCLAIMER
        };
    }

    const lowerText = text.toLowerCase();
    const matchedKeywords = [];
    const severityScores = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
    };

    const criticalPatterns = [
        { pattern: /heart\s*attack|chest\s*pain|cardiac\s*arrest/i, category: 'cardiac' },
        { pattern: /cant\s*breathe|cannot\s*breathe|unable\s*to\s*breathe|choking|airway\s*block/i, category: 'respiratory' },
        { pattern: /loss\s*of\s*consciousness|unconscious|passed\s*out|fainted|collapse/i, category: 'consciousness' },
        { pattern: /severe\s*bleed|uncontrolled\s*bleeding|arterial|gushing|bleeding\s*wont\s*stop/i, category: 'hemorrhage' },
        { pattern: /suicid|want\s*to\s*die|kill\s*myself|end\s*my\s*life|no\s*reason\s*to\s*live/i, category: 'psychiatric' },
        { pattern: /anaphyla|throat.*swell|tongue.*swell|severe\s*allergic\s*reaction/i, category: 'allergic' },
        { pattern: /stroke|face\s*droop|arm\s*weak|speech\s*difficult|facial\s*droop/i, category: 'neurological' },
        { pattern: /seizure|convulsion|epilep|grand\s*mal/i, category: 'neurological' },
        { pattern: /poison|overdose|drug\s*overdose|toxic\s*ingestion/i, category: 'toxicology' },
        { pattern: /cant\s*stop\s*vomit|vomit.*blood|hematemesis/i, category: 'gastrointestinal' },
        { pattern: /blood\s*in\s*stool|black\s*tarry\s*stool|melena/i, category: 'gastrointestinal' },
        { pattern: /severe\s*burn|burn.*face|burn.*airway|extensive\s*burn|third\s*degree/i, category: 'burns' },
        { pattern: /cough.*blood|hemoptysis/i, category: 'respiratory' },
        { pattern: /paralysis|cant\s*move|unable\s*to\s*move/i, category: 'neurological' }
    ];

    const highPatterns = [
        { pattern: /severe\s*headache|worst\s*headache|thunderclap\s*headache/i, category: 'neurological' },
        { pattern: /high\s*fever|fever.*adult|fever.*child|temperature.*10[3-4]/i, category: 'infection' },
        { pattern: /stiff\s*neck.*fever|neck\s*stiff/i, category: 'meningitis' },
        { pattern: /abdominal\s*pain\s*severe|severe\s*stomach\s*pain|sharp\s*abdominal/i, category: 'gastrointestinal' },
        { pattern: /difficulty\s*breathe|trouble\s*breathe|shortness\s*of\s*breath/i, category: 'respiratory' },
        { pattern: /dizziness.*faint|lightheaded.*weak/i, category: 'cardiovascular' },
        { pattern: /allergic\s*reaction|hives.*swelling|swelling.*lips|swelling.*face/i, category: 'allergic' },
        { pattern: /deep\s*cut|wont\s*stop\s*bleeding/i, category: 'hemorrhage' }
    ];

    const mediumPatterns = [
        { pattern: /nausea.*vomit|vomiting|throw\s*up/i, category: 'gastrointestinal' },
        { pattern: /diarrhea|loose\s*stool|watery\s*stool/i, category: 'gastrointestinal' },
        { pattern: /pain.*severe|severe\s*pain|unbearable\s*pain/i, category: 'pain' },
        { pattern: /rash.*spreading|hives|swelling/i, category: 'dermatological' },
        { pattern: /headache.*persistent|headache.*constant/i, category: 'neurological' },
        { pattern: /bleeding.*nose|nosebleed.*severe|epistaxis/i, category: 'hemorrhage' }
    ];

    const lowPatterns = [
        { pattern: /cough|cold|flu|sneeze/i, category: 'respiratory' },
        { pattern: /mild\s*headache|headache|migraine/i, category: 'neurological' },
        { pattern: /stomach\s*ache|abdominal\s*discomfort|mild\s*nausea/i, category: 'gastrointestinal' },
        { pattern: /joint\s*pain|back\s*pain|muscle\s*pain/i, category: 'musculoskeletal' },
        { pattern: /tired|fatigue|exhausted/i, category: 'general' }
    ];

    for (const { pattern, category } of criticalPatterns) {
        if (pattern.test(text)) {
            matchedKeywords.push({ keyword: pattern.source, category, severity: 'critical' });
            severityScores.critical++;
        }
    }

    for (const { pattern, category } of highPatterns) {
        if (pattern.test(text)) {
            matchedKeywords.push({ keyword: pattern.source, category, severity: 'high' });
            severityScores.high++;
        }
    }

    for (const { pattern, category } of mediumPatterns) {
        if (pattern.test(text)) {
            matchedKeywords.push({ keyword: pattern.source, category, severity: 'medium' });
            severityScores.medium++;
        }
    }

    for (const { pattern, category } of lowPatterns) {
        if (pattern.test(text)) {
            matchedKeywords.push({ keyword: pattern.source, category, severity: 'low' });
            severityScores.low++;
        }
    }

    const directKeywordMatches = [];
    for (const keyword of MEDICAL_KB.emergencyKeywords) {
        if (lowerText.includes(keyword.toLowerCase())) {
            directKeywordMatches.push(keyword);
        }
    }

    let overallSeverity = 'low';
    if (severityScores.critical > 0) overallSeverity = 'critical';
    else if (severityScores.high > 0) overallSeverity = 'high';
    else if (severityScores.medium > 0) overallSeverity = 'medium';

    const isEmergency = overallSeverity === 'critical' || overallSeverity === 'high';

    let message = '';
    let advice = '';

    if (overallSeverity === 'critical') {
        message = 'EMERGENCY DETECTED: The text contains keywords and patterns that strongly suggest a medical emergency. This could indicate a life-threatening situation.';
        advice = 'CALL EMERGENCY SERVICES IMMEDIATELY (911 in the US, 112 in Europe, 999 in the UK, or your local emergency number). Do not wait. While waiting for help: stay calm, stay on the line with emergency services, and follow their instructions.';
    } else if (overallSeverity === 'high') {
        message = 'URGENT: The text contains symptoms that may indicate a serious medical condition requiring prompt medical attention.';
        advice = 'Contact your local emergency services or go to the nearest emergency room immediately. If you are unsure, it is always safer to seek emergency medical care. Do not drive yourself if possible.';
    } else if (overallSeverity === 'medium') {
        message = 'CAUTION: The text contains symptoms that could indicate a condition requiring medical evaluation.';
        advice = 'Contact your healthcare provider or visit an urgent care clinic. If symptoms worsen or become severe, seek emergency care immediately.';
    } else {
        message = 'The text does not contain strong indicators of a medical emergency, but symptoms should still be monitored.';
        advice = 'If you are concerned about your symptoms, consult with a healthcare provider. Monitor your symptoms and seek medical attention if they worsen.';
    }

    return {
        isEmergency,
        severity: overallSeverity,
        matchedKeywords: matchedKeywords.map(m => m.keyword),
        categories: [...new Set(matchedKeywords.map(m => m.category))],
        message,
        advice,
        disclaimer: EMERGENCY_DISCLAIMER
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// validateFile
// ─────────────────────────────────────────────────────────────────────────────

function validateFile(file) {
    if (!file || typeof file !== 'object') {
        return {
            valid: false,
            error: 'No file object provided.',
            fileType: null
        };
    }

    const allowedMimeTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'text/plain',
        'text/csv'
    ];

    const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.txt', '.csv'];

    const maxReportSize = 10 * 1024 * 1024; // 10MB
    const maxPhotoSize = 5 * 1024 * 1024;   // 5MB

    const magicBytes = {
        pdf: Buffer.from([0x25, 0x50, 0x44, 0x46]),      // %PDF
        jpeg: Buffer.from([0xFF, 0xD8, 0xFF]),              // FF D8 FF
        png: Buffer.from([0x89, 0x50, 0x4E, 0x47]),       // 89 50 4E 47
        webpRIFF: Buffer.from([0x52, 0x49, 0x46, 0x46]),  // RIFF
        webpWEBP: Buffer.from([0x57, 0x45, 0x42, 0x50])   // WEBP
    };

    let detectedFileType = 'unknown';
    const errors = [];

    // 1. MIME type validation
    if (file.mimetype) {
        if (!allowedMimeTypes.includes(file.mimetype)) {
            errors.push(`MIME type '${file.mimetype}' is not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`);
        }
    } else {
        errors.push('MIME type is missing.');
    }

    // 2. File extension validation
    const originalName = file.originalname || '';
    const ext = path.extname(originalName).toLowerCase();
    if (ext) {
        if (!allowedExtensions.includes(ext)) {
            errors.push(`File extension '${ext}' is not allowed. Allowed extensions: ${allowedExtensions.join(', ')}`);
        }
    } else {
        errors.push('File extension is missing.');
    }

    // 3. Magic bytes validation
    if (file.buffer && Buffer.isBuffer(file.buffer)) {
        const header = file.buffer.slice(0, Math.min(file.buffer.length, 12));

        if (header.length >= 4) {
            if (header.slice(0, 4).equals(magicBytes.pdf)) {
                detectedFileType = 'pdf';
            } else if (header.slice(0, 3).equals(magicBytes.jpeg)) {
                detectedFileType = 'jpeg';
            } else if (header.slice(0, 4).equals(magicBytes.png)) {
                detectedFileType = 'png';
            } else if (header.length >= 12 &&
                       header.slice(0, 4).equals(magicBytes.webpRIFF) &&
                       header.slice(8, 12).equals(magicBytes.webpWEBP)) {
                detectedFileType = 'webp';
            }
        }

        if (detectedFileType === 'unknown' && file.mimetype) {
            if (file.mimetype === 'application/pdf') detectedFileType = 'pdf';
            else if (file.mimetype === 'image/jpeg') detectedFileType = 'jpeg';
            else if (file.mimetype === 'image/png') detectedFileType = 'png';
            else if (file.mimetype === 'image/webp') detectedFileType = 'webp';
            else if (file.mimetype === 'text/plain') detectedFileType = 'text';
            else if (file.mimetype === 'text/csv') detectedFileType = 'csv';
        }

        if (detectedFileType === 'unknown') {
            if (ext === '.pdf') detectedFileType = 'pdf';
            else if (ext === '.jpg' || ext === '.jpeg') detectedFileType = 'jpeg';
            else if (ext === '.png') detectedFileType = 'png';
            else if (ext === '.webp') detectedFileType = 'webp';
            else if (ext === '.txt') detectedFileType = 'text';
            else if (ext === '.csv') detectedFileType = 'csv';
        }

        // Validate magic bytes against MIME type
        if (detectedFileType !== 'unknown' && file.mimetype) {
            const mimeMap = {
                'application/pdf': 'pdf',
                'image/jpeg': 'jpeg',
                'image/png': 'png',
                'image/webp': 'webp',
                'text/plain': 'text',
                'text/csv': 'csv'
            };
            const expectedType = mimeMap[file.mimetype];
            if (expectedType && expectedType !== detectedFileType) {
                errors.push(`File content does not match the declared MIME type. Declared: ${file.mimetype}, Detected: ${detectedFileType}`);
            }
        }
    } else {
        detectedFileType = file.mimetype || 'unknown';
    }

    // 4. File size validation
    const fileSize = file.size || (file.buffer ? file.buffer.length : 0);
    const isImageType = ['jpeg', 'png', 'webp'].includes(detectedFileType);
    const isReportType = ['pdf', 'text', 'csv'].includes(detectedFileType);

    if (fileSize > 0) {
        const maxSize = isImageType ? maxPhotoSize : maxReportSize;
        if (fileSize > maxSize) {
            const maxMB = (maxSize / (1024 * 1024)).toFixed(0);
            const fileMB = (fileSize / (1024 * 1024)).toFixed(2);
            errors.push(`File size (${fileMB}MB) exceeds the maximum allowed size (${maxMB}MB) for ${isImageType ? 'images' : 'reports'}.`);
        }
    }

    // 5. Image-specific validations (dimension check)
    if (isImageType && file.buffer) {
        // Note: Actual image dimension parsing requires an image library
        // For pure Node.js without external deps, we check if we can detect image headers
        // and note that dimension validation would require additional processing
        // This is a placeholder that acknowledges the requirement
    }

    // 6. PDF-specific validations (page count)
    if (detectedFileType === 'pdf' && file.buffer) {
        // Count pages by looking for /Type /Page patterns in PDF
        const pdfContent = file.buffer.toString('latin1');
        const pageMatches = pdfContent.match(/\/Type\s*\/Page[^s]/g);
        const pageCount = pageMatches ? pageMatches.length : 0;
        if (pageCount > 20) {
            errors.push(`PDF has ${pageCount} pages, which exceeds the maximum allowed of 20 pages.`);
        }
    }

    const fileTypeMap = {
        'pdf': 'application/pdf',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'webp': 'image/webp',
        'text': 'text/plain',
        'csv': 'text/csv'
    };

    return {
        valid: errors.length === 0,
        error: errors.length > 0 ? errors.join('; ') : null,
        fileType: detectedFileType !== 'unknown' ? (fileTypeMap[detectedFileType] || detectedFileType) : (file.mimetype || 'unknown'),
        detectedFileType,
        originalName,
        fileSize
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// classifyDocument
// ─────────────────────────────────────────────────────────────────────────────

function classifyDocument(text, mimeType) {
    if (!text || typeof text !== 'string') {
        return {
            isMedical: false,
            confidence: 0,
            category: 'unknown',
            reason: 'No text content provided for classification.'
        };
    }

    const lowerText = text.toLowerCase();
    let medicalScore = 0;
    let totalChecks = 0;
    const reasons = [];

    const medicalKeywords = [
        'test', 'lab', 'laboratory', 'report', 'diagnosis', 'prescription',
        'blood', 'urine', 'xray', 'x-ray', 'mri', 'ct', 'scan', 'patient',
        'doctor', 'hospital', 'clinic', 'physician', 'medication', 'dosage',
        'treatment', 'therapy', 'surgery', 'procedure', 'examination',
        'vital', 'vitals', 'temperature', 'pulse', 'respiration',
        'specimen', 'collection', 'result', 'reference', 'range',
        'normal', 'abnormal', 'elevated', 'decreased', 'positive', 'negative',
        'chart', 'medical record', 'health', 'healthcare', 'pharmacy',
        'nurse', 'surgeon', 'specialist', 'referral', 'follow-up',
        'discharge', 'admission', 'inpatient', 'outpatient',
        'pathology', 'radiology', 'oncology', 'cardiology', 'neurology',
        'hematology', 'chemistry', 'immunology', 'microbiology',
        'biopsy', 'culture', 'sensitivity', 'antibiotic',
        'chronic', 'acute', 'condition', 'prognosis', 'symptom',
        'pain', 'fever', 'infection', 'inflammation', 'disease',
        'disorder', 'syndrome', 'tumor', 'mass', 'lesion'
    ];

    const medicalTestNames = [
        'complete blood count', 'cbc', 'basic metabolic panel', 'bmp',
        'comprehensive metabolic panel', 'cmp', 'lipid panel', 'lipid profile',
        'thyroid panel', 'tsh', 'free t4', 'hemoglobin a1c', 'a1c',
        'fasting glucose', 'blood glucose', 'urinalysis', 'urine culture',
        'electrolytes', 'sodium', 'potassium', 'chloride', 'co2',
        'calcium', 'magnesium', 'phosphorus', 'iron', 'ferritin',
        'vitamin d', 'vitamin b12', 'folate', 'follicle stimulating hormone',
        'luteinizing hormone', 'testosterone', 'estrogen', 'progesterone',
        'prostate specific antigen', 'psa', 'carcinoembryonic antigen', 'cea',
        'alpha fetoprotein', 'afp', 'erythrocyte sedimentation rate', 'esr',
        'c reactive protein', 'crp', 'procalcitonin', 'd dimer',
        'fibrinogen', 'pt', 'inr', 'aptt', 'prothrombin time',
        'computed tomography', 'magnetic resonance', 'echocardiogram',
        'electrocardiogram', 'ecg', 'ekg', 'colonoscopy', 'endoscopy',
        'mammogram', 'ultrasound', 'pet scan', 'bone scan',
        'spirometry', 'pulmonary function', 'stress test', 'holter monitor'
    ];

    const labValuePatterns = [
        /\d+\.?\d*\s*mg\/dL/gi,
        /\d+\.?\d*\s*g\/dL/gi,
        /\d+\.?\d*\s*\/mcL/gi,
        /\d+\.?\d*\s*mmHg/gi,
        /\d+\.?\d*\s*mIU\/L/gi,
        /\d+\.?\d*\s*U\/L/gi,
        /\d+\.?\d*\s*ng\/mL/gi,
        /\d+\.?\d*\s*mmol\/L/gi,
        /\d+\.?\d*\s*μmol\/L/gi,
        /\d+\.?\d*\s*mEq\/L/gi,
        /\d+\.?\d*\s*pg\/mL/gi,
        /\d+\.?\d*\s*IU\/mL/gi
    ];

    const medicalStructures = [
        /patient\s*(name|id|number|info)/i,
        /date\s*of\s*(birth|examination|collection|service)/i,
        /ordering\s*(physician|doctor|provider)/i,
        /referring\s*(physician|doctor|provider)/i,
        /specimen\s*(type|collected|received)/i,
        /collection\s*(date|time)/i,
        /report\s*(date|status)/i,
        /reference\s*(range|values)/i,
        /normal\s*(range|values|limits)/i,
        /result\s*(s|status|value)/i,
        /critical\s*(value|flag)/i,
        /abnormal\s*(flag|result)/i,
        /units?\s*:/i,
        /methodology/i,
        /performing\s*(lab|facility|institution)/i
    ];

    const labHeaders = [
        /^test\s*name/i,
        /^analyte/i,
        /^component/i,
        /^result/i,
        /^value/i,
        /^units?/i,
        /^reference/i,
        /^flag/i,
        /^status/i
    ];

    // Check medical keywords
    for (const keyword of medicalKeywords) {
        totalChecks++;
        if (lowerText.includes(keyword.toLowerCase())) {
            medicalScore++;
        }
    }

    // Check medical test names
    for (const testName of medicalTestNames) {
        totalChecks++;
        if (lowerText.includes(testName.toLowerCase())) {
            medicalScore += 2; // Higher weight for specific test names
        }
    }

    // Check lab value patterns
    let labValueCount = 0;
    for (const pattern of labValuePatterns) {
        const matches = lowerText.match(pattern);
        if (matches) {
            labValueCount += matches.length;
        }
    }
    if (labValueCount > 0) {
        medicalScore += Math.min(labValueCount, 5);
        totalChecks++;
    }

    // Check medical report structure
    let structureMatches = 0;
    for (const structure of medicalStructures) {
        if (structure.test(text)) {
            structureMatches++;
        }
    }
    if (structureMatches > 0) {
        medicalScore += Math.min(structureMatches, 4);
        totalChecks++;
    }

    // Check for table-like structure (lab reports often have columns)
    const lines = text.split('\n');
    let tableLines = 0;
    for (const line of lines) {
        if (/\t/.test(line) || /\s{3,}/.test(line)) {
            tableLines++;
        }
    }
    if (tableLines > 3) {
        medicalScore += 1;
        totalChecks++;
    }

    // Check for lab headers
    let headerMatches = 0;
    for (const header of labHeaders) {
        for (const line of lines) {
            if (header.test(line.trim())) {
                headerMatches++;
                break;
            }
        }
    }
    if (headerMatches > 0) {
        medicalScore += 2;
        totalChecks++;
    }

    // MIME type bonus
    if (mimeType) {
        totalChecks++;
        if (mimeType === 'application/pdf' || mimeType.startsWith('image/')) {
            medicalScore += 0.5;
        }
    }

    // Weighted confidence: keywords/test names hit + lab values + structures
    const keywordHits = medicalScore;
    const confidence = Math.min(
        (keywordHits * 15) + (labValueCount * 20) + (structureMatches * 15) + (headerMatches * 10),
        100
    );

    let category = 'general';
    if (lowerText.includes('lab') || lowerText.includes('test') || lowerText.includes('result') || labValueCount > 0) {
        category = 'laboratory';
    } else if (lowerText.includes('radiology') || lowerText.includes('x-ray') || lowerText.includes('mri') || lowerText.includes('ct') || lowerText.includes('scan')) {
        category = 'radiology';
    } else if (lowerText.includes('prescription') || lowerText.includes('medication') || lowerText.includes('dosage')) {
        category = 'prescription';
    } else if (lowerText.includes('pathology') || lowerText.includes('biopsy')) {
        category = 'pathology';
    } else if (lowerText.includes('discharge') || lowerText.includes('admission') || lowerText.includes('medical record')) {
        category = 'medical_record';
    } else if (lowerText.includes('surgery') || lowerText.includes('operative') || lowerText.includes('procedure')) {
        category = 'surgical';
    }

    const isMedical = confidence >= 15;

    // ── Report Type Detection (via specialized analyzer) ────────────────────
    const reportTypeResult = reportTypeAnalyzer.detectReportType(text);

    return {
        isMedical,
        confidence: Math.round(confidence * 10) / 10,
        category,
        medicalScore,
        totalChecks,
        labValueCount,
        structureMatches,
        reasons: reasons.length > 0 ? reasons : undefined,
        reportType: reportTypeResult.type !== 'unknown' ? reportTypeResult : null,
        summary: isMedical
            ? `This document appears to be a medical document (category: ${category}, type: ${reportTypeResult.name || 'general'}) with ${Math.round(confidence)}% confidence.`
            : `This document does not appear to be primarily a medical document (confidence: ${Math.round(confidence)}%).`
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// chat
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Report Type Quick Actions
// ─────────────────────────────────────────────────────────────────────────────

function getReportTypeQuickActions(reportTypeData, tests) {
    if (!reportTypeData) return [];
    const type = reportTypeData.type;
    const actions = [];

    const abnormal = (tests || []).filter(t => t.status === 'high' || t.status === 'low');
    const hasCritical = reportTypeData.criticalAlerts && reportTypeData.criticalAlerts.length > 0;

    const typeActionMap = {
        cbc: [
            'Explain what each blood cell type means',
            'What could cause low/high hemoglobin?',
            'Show questions to ask my doctor'
        ],
        cmp: [
            'Explain my liver and kidney function',
            'What do sodium/potassium levels mean?',
            'Show questions to ask my doctor'
        ],
        lipid: [
            'Explain my cardiovascular risk',
            'What is the difference between LDL and HDL?',
            'Show lifestyle recommendations'
        ],
        thyroid: [
            'Explain hypothyroidism vs hyperthyroidism',
            'What does my TSH level mean?',
            'Do I need to see an endocrinologist?'
        ],
        diabetes: [
            'Explain what my A1C means',
            'How is diabetes managed?',
            'Show questions for my doctor'
        ],
        ecg: [
            'Explain my heart rhythm',
            'What does ST segment mean?',
            'Do I need a cardiology follow-up?'
        ],
        xray: [
            'Explain what the X-ray shows',
            'What does the impression mean?',
            'Do I need additional imaging?'
        ],
        ct: [
            'Explain what the CT scan found',
            'What does enhancement/attenuation mean?',
            'Do I need a follow-up scan?'
        ],
        mri: [
            'Explain what the MRI shows',
            'What do signal intensities mean?',
            'Do I need to see a specialist?'
        ],
        ultrasound: [
            'Explain what the ultrasound found',
            'What do the measurements mean?',
            'Do I need follow-up imaging?'
        ],
        urine: [
            'Explain what each urine test means',
            'Do I have a UTI?',
            'What does protein in urine mean?'
        ],
        pregnancy: [
            'Explain my pregnancy scan results',
            'What do the fetal measurements mean?',
            'Is my pregnancy progressing normally?'
        ],
        histology: [
            'Explain what the biopsy found',
            'What does the pathology report say?',
            'Do I need treatment?'
        ],
        eye: [
            'Explain my vision test results',
            'What does my IOP reading mean?',
            'Do I need to see an eye specialist?'
        ],
        ear: [
            'Explain my hearing test results',
            'What do the audiometry numbers mean?',
            'Do I need hearing aids?'
        ],
        neurology: [
            'Explain my nerve study results',
            'What do the EEG findings mean?',
            'Do I need a neurology referral?'
        ],
        allergy: [
            'Explain my allergy test results',
            'How can I avoid my allergens?',
            'Do I need an EpiPen?'
        ],
        prescription: [
            'Explain each medication',
            'Are there side effects to watch for?',
            'Are there drug interactions?'
        ]
    };

    const defaults = typeActionMap[type] || [
        'Summarize this report',
        'What questions should I ask my doctor?',
        'Are there any urgent concerns?'
    ];

    actions.push(...defaults);

    if (hasCritical) {
        actions.unshift('⚠️ What are the critical findings?');
    }

    return actions.slice(0, 5);
}

// ─────────────────────────────────────────────────────────────────────────────
// detectMessageLanguage
// ─────────────────────────────────────────────────────────────────────────────

function detectMessageLanguage(text) {
    if (!text) return 'en';
    const scripts = {
        'Devanagari': /[\u0900-\u097F]/g, 'Bengali': /[\u0980-\u09FF]/g,
        'Tamil': /[\u0B80-\u0BFF]/g, 'Telugu': /[\u0C00-\u0C7F]/g,
        'Gujarati': /[\u0A80-\u0AFF]/g, 'Kannada': /[\u0C80-\u0CFF]/g,
        'Malayalam': /[\u0D00-\u0D7F]/g, 'Gurmukhi': /[\u0A00-\u0A7F]/g,
        'Odia': /[\u0B00-\u0B7F]/g, 'Arabic': /[\u0600-\u06FF\u0750-\u077F]/g
    };
    const langMap = {
        'Devanagari': 'hi', 'Bengali': 'bn', 'Tamil': 'ta', 'Telugu': 'te',
        'Gujarati': 'gu', 'Kannada': 'kn', 'Malayalam': 'ml', 'Gurmukhi': 'pa',
        'Odia': 'or', 'Arabic': 'ur'
    };
    let maxCount = 0, detected = 'en';
    for (const [script, regex] of Object.entries(scripts)) {
        const matches = text.match(regex);
        if (matches && matches.length > maxCount) {
            maxCount = matches.length;
            detected = langMap[script] || 'en';
        }
    }
    return detected;
}

const LANG_RESPONSE_PREFIX = {
    'hi': '\u0915\u0943\u092A\u092F\u093E \u092E\u0947\u0902 \u0906\u092A\u0915\u094B \u0907\u0938 \u092D\u093E\u0937\u093E \u092E\u0947\u0902 \u0938\u0939\u093E\u092F\u0924\u093E \u0926\u0947\u0928\u0947 \u0915\u0940 \u0915\u094B\u0936\u093F\u0936. \u0915\u0943\u092A\u092F\u093E \u092E\u0947\u0902 \u0906\u092A\u0915\u094B \u092D\u093E\u0937\u093E \u092E\u0947\u0902 \u091C\u0935\u093E\u092C \u0926\u0947\u0902\u0917\u0947\u0964\n\n',
    'bn': '\u09A6\u09C1\u09B9\u09C0\u09A8\u09A4\u09C7 \u09A4\u09BE \u09B8\u09B9\u09BE\u09AF\u09BC \u0995\u09B0\u09C7\u099B\u09C7\u0964 \u09A6\u09C1\u09B9\u09C0\u09A8\u09A4\u09C7 \u09A6\u09C1\u0997\u09CD\u09A4\u09B0 \u09AD\u09BE\u09B7\u09BE\u09AF\u09BC \u09A4\u09C8\u09B0\u09BF \u09A6\u09C7\u0993\u09AF\u09BC\u09A4\u09C7\u099B\u09C7\u0964\n\n',
    'mr': '\u092E\u0940 \u0906\u092A\u0932\u093E \u092F\u093E \u0936\u0915\u094D\u092F\u093E \u0906\u0939\u0947. \u092E\u0940 \u0906\u092A\u0932\u093E \u092F\u093E \u092D\u093E\u0937\u093E\u0924 \u092E\u0947\u0902 \u091C\u0935\u093E\u092C \u0926\u0947\u0924\u094B.\n\n',
    'ta': '\u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BCD\u0B95\u0BC1 \u0B95\u0BCD\u0BA4\u0BBE\u0BAF\u0BBF \u0BA8\u0BBE\u0BA9\u0BCD Shrijal. \u0BA8\u0BBE\u0BA9\u0BCD \u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BCD\u0B95\u0BC1 \u0B8E\u0BA9\u0BCD\u0BA4 \u0B89\u0BA4\u0BB5\u0BBF \u0B9A\u0BC6\u0BAF\u0BCD\u0BAE\u0BBE\u0BA9\u0BCD \u0B89\u0BA4\u0BB5\u0BBF\u0BB2\u0BCD \u0BB5\u0BBF\u0BB0\u0BC1\u0B95\u0BCD\u0B95\u0BB2\u0BCD. \u0B89\u0BB9\u0B95\u0BAE\u0BCD \u0B9A\u0BB0\u0BBF\u0BAF\u0BBE\u0B95 \u0BC7\u0B9F\u0BCD\u0B9F\u0BC1\u0B95\u0B9A\u0BCd\u0B9A\u0BBF \u0BB5\u0BC7\u0BB4\u0BCd\u0BBF\u0BBF.\n\n',
    'te': '\u0928\u0947\u0928\u0941 \u0907\u092E\u0948 \u0938\u0939\u093E\u092F\u0902 \u0907\u0938\u094D\u0924\u094D\u0935\u0930\u0938\u0938\u094D \u0907\u0938\u094D\u0924\u094D. \u0928\u0947\u0928\u0941 \u092E\u0940\u0925 \u0935\u0948\u0926\u094D\u092F\u0935\u0947\u0924 \u0938\u0939\u093E\u092F\u0902 \u0928\u093F\u0930\u094D\u0923\u094B\u0939\u092E\u0941.\n\n',
    'gu': '\u0939\u0941\u0902 \u0907\u0938 \u092C\u093E\u0930\u0947 \u0935\u093F\u0936\u094D\u0935\u093E\u0938 \u0915\u0930\u0942\u0902 \u091B\u0941\u0902. \u0939\u0941\u0902 \u0907\u0938 \u0935\u093F\u0937\u092F \u092E\u093E\u093F\u0924\u094D\u0930\u0940\u0902 \u092A\u094D\u0930\u0926\u093E\u0928 \u0915\u0930\u0946\u091C \u091B\u0941\u0902.\n\n',
    'kn': '\u0928\u093E\u0928\u0941 \u0907\u0938 \u092C\u093E\u0930\u0947 \u0938\u0939\u093E\u092F \u092E\u093E\u0921\u093F \u092E\u093E\u0921\u092C\u0939\u093F\u0938\u094D\u0924\u0947\u0928\u0947 \u092A\u094D\u0930\u092F\u0924\u094D\u0928. \u0928\u093E\u0928\u0941 \u0907\u0938 \u0935\u093F\u0937\u092F \u092E\u093E\u0939\u093F\u0924\u094D\u0930\u093F\u0917\u0933\u0935\u0930\u0941 \u0932\u093F\u0915\u094D\u0939\u0947 \u0938\u0939\u093E\u092F\u093F\u0930\u0941.\n\n',
    'ml': '\u091E\u093E\u0928\u094D \u0907\u0924\u093F\u0935\u0938\u094D \u0938\u0939\u093E\u092F\u093E\u0923 \u0928\u0932\u094D\u0915\u094D\u0915\u0941\u09A9\u09CD\u09A4\u0941. \u091E\u093E\u0928\u094D \u0907\u0924\u093F\u0935\u0938\u094D \u0906\u0930\u094B\u0917\u094D\u09AF\u0902 \u0928\u0932\u094D\u0915\u094D\u0915\u0941\u09A9\u09CD\u09A4\u0941.\n\n',
    'pa': '\u092E\u0948\u0902 \u0907\u0938 \u092C\u093E\u0930\u0947 \u0935\u0940 \u0938\u0939\u093E\u092F\u0924\u093E \u0926\u093F\u0909\u0902\u0926\u093E \u0939\u093E\u0902. \u092E\u0948\u0902 \u0907\u0938 \u0935\u093F\u0935\u0930\u093E\u0930 \u092A\u094D\u0930\u0924\u0940\u0995\u094D\u0930\u093F\u092F\u093E \u0926\u0947\u0923\u093E \u091A\u093E\u0939\u0941\u0902\u0917\u093E.\n\n',
    'ur': '\u0945 \u0906\u092A \u0915\u094B \u0927\u094D\u0948\u0931 \u0926\u0947\u0924\u093E \u0939\u0948\u0964 \u0945 \u0906\u092A \u0915\u094B \u0935\u094B \u0927\u094D\u0948\u0931 \u092C\u0927 \u092F\u093E \u0938\u0948 \u0928\u0938\u094D\u0925 \u0928\u0948 \u092F\u0947\u0917\u093E\u0964\n\n',
    'en': ''
};

const LANG_RESPONSE_SUFFIX = {
    'hi': '\n\n\u0915\u0943\u092A\u092F\u093E \u092F\u093E\u0926 \u0939\u0948 \u0915\u093F \u0906\u092A\u0915\u094B \u0907\u0938\u0915\u0947 \u092C\u093E\u0930\u0947 \u092E\u0947\u0902 \u092E\u0926\u0926 \u092E\u093F\u0932 \u0938\u0915\u0924\u0940 \u0939\u0948\u0964 \u0915\u0943\u092A\u092F\u093E \u0905\u092A\u0928\u0947 \u0938\u094D\u0935\u093E\u0938\u094D\u0925 \u0915\u0947 \u0932\u093F\u090F \u090F\u0915 \u092F\u094B\u0917\u094D\u092F \u0938\u094D\u0935\u093E\u0938\u094D\u0925 \u092A\u094D\u0930\u093E\u092B\u093C\u0947\u0938\u094D\u0915 \u0938\u0947 \u092A\u0930\u093E\u092E\u0930\u094D\u0936 \u0915\u0930\u0928\u0947 \u091A\u093E\u0939\u093F\u090F\u0964',
    'bn': '\n\n\u09A6\u09AF\u09BC\u09BE \u09B8\u09C1\u09A8\u09BF\u09B6\u09CD\u099A\u09BF\u09A4 \u099C\u09A8\u09A4\u09BE \u09A8\u09BF\u09B0\u09CD\u09A3\u09DF\u09A8 \u09A6\u09C7\u0993\u09AF\u09BC\u09A4\u09C7 \u09B8\u09BE\u09B9\u09BE\u09AF\u09BC \u0995\u09B0\u09C7\u09A8\u09CD \u098F\u0995 \u099C\u09A8\u09A4\u09BE \u09B8\u09CD\u09A5\u09BE\u09A8 \u09A6\u09C7\u0996\u09C1\u09A8\u09CD\u09A4\u09C7\u0964',
    'ta': '\n\n\u0B89\u0B99\u0BCd\u0B95\u0BB3\u0BCD\u0B95\u0BC1 \u0B9F\u0BBE\u0B95\u0BCd\u0B9F\u0BB0\u0BCD \u0B89\u0B99\u0BCd\u0B95\u0BB3\u0BCD\u0B95\u0BC1\u0B9F\u0BC6 \u0BAE\u0BB1\u0BCd\u0B9A\u0BCd \u0BAA\u0BCC\u0BBF\u0BAF\u0BBF\u0B9F\u0BCd\u0B9A\u0BC1\u0B95\u0BCd\u0B95\u0BC1\u0BAE\u0BCd \u0B9A\u0BC6\u0BAF\u0BCd\u0B95\u0BB5\u0BC1\u0BAE\u0BCd. \u0B89\u0B99\u0BCd\u0B95\u0BB3\u0BCD\u0B95\u0BC1 \u0B9A\u0BB0\u0BBF\u0BAF\u0BBE\u0B95 \u0BC7\u0B9F\u0BCd\u0B9F\u0BC1\u0B95\u0B9A\u0BCd\u0B9A\u0BBF \u0BB5\u0BC7\u0BB4\u0BCd\u0BBF\u0BBF.',
    'te': '\n\n\u092E\u0940\u0925 \u0935\u0948\u0926\u094D\u092F\u0935\u0947\u0924 \u0928\u093F\u0930\u094D\u0923\u093E\u0923 \u0915\u094B\u0938\u092E\u0947 \u0928\u093F\u0935\u094D\u0937\u093F\u0923\u0938\u094D \u0928\u093F\u0930\u094D\u0923\u094B\u0939\u092E\u0941\u0928\u093F \u0938\u0932\u0939 \u0924\u0940\u0938\u094D\u0924\u094D\u0935\u0930 \u0938\u093E\u0930\u093F \u0938\u0932\u0939 \u0928\u093F\u0935\u093F\u0926\u0932\u0939\u093F\u0902\u091A\u0940 \u0905\u0935\u0938\u0930\u0941\u0921\u094D\u091C \u0915\u0930\u092E\u0928\u093F.',
    'en': '\n\nPlease consult a qualified healthcare professional for personalized medical advice.'
};

function getResponseLanguagePrefix(detectedLang) {
    return LANG_RESPONSE_PREFIX[detectedLang] || '';
}

function getResponseLanguageSuffix(detectedLang) {
    return LANG_RESPONSE_SUFFIX[detectedLang] || LANG_RESPONSE_SUFFIX['en'];
}

async function chat(message, context = {}) {
    if (!message || typeof message !== 'string') {
        return {
            response: 'I need a message to respond to. Please type your health question or concern.',
            type: 'text',
            sources: []
        };
    }

    const { role, patientId, conversationHistory, conversationLanguage, conversationLocale, reportContext } = context;
    const detectedLang = conversationLanguage || detectMessageLanguage(message);
    const langPrefix = getResponseLanguagePrefix(detectedLang);
    const langSuffix = getResponseLanguageSuffix(detectedLang);
    const lowerMessage = message.toLowerCase();

    // ── Language Request Detection ─────────────────────────────────────────
    const langRequestPatterns = [
        { pattern: /\b(hindi\s*(mein?|ma(?:n|y)?|baat|bolo|bhasha|me)\b|hindi\s+bhasha|हिंदी\s*(में|मा|बोलो|बात|भाषा))/i, lang: 'hi', langName: 'Hindi' },
        { pattern: /\b(tamil\s*(la|il|ukku|ukkula|pesu|pesunga|bhashai?)?|தமிழ்\s*(பேச|பேசு|ல|இல்))/i, lang: 'ta', langName: 'Tamil' },
        { pattern: /\b(bengali|bangla)\s*(e|te|te\w*|bolo|kotha|bhasha|e\s+bol)?/i, lang: 'bn', langName: 'Bengali' },
        { pattern: /\b(marathi|marathi\s*(madhye|madhe|t bol|bhasha)?)/i, lang: 'mr', langName: 'Marathi' },
        { pattern: /\b(telugu|telugu\s*(lo|lō|matladu|bhashalo)?)/i, lang: 'te', langName: 'Telugu' },
        { pattern: /\b(gujarati|gujarati\s*(ma|maa|bhasha)?)/i, lang: 'gu', langName: 'Gujarati' },
        { pattern: /\b(kannada|kannadavannu|kannada\s*(alli|nalli|nalli)?)/i, lang: 'kn', langName: 'Kannada' },
        { pattern: /\b(malayalam|malayalam\s*(il|il|parayuka|parayamo)?)/i, lang: 'ml', langName: 'Malayalam' },
        { pattern: /\b(punjabi|punjabi\s*(ch|wich|bhasha)?)/i, lang: 'pa', langName: 'Punjabi' },
        { pattern: /\b(odia|oriya|odia\s*(re|ru|bhasha)?)/i, lang: 'or', langName: 'Odia' },
        { pattern: /\b(assamese|asamiya|assamese\s*(t|at|bhasha)?)/i, lang: 'as', langName: 'Assamese' },
        { pattern: /\b(urdu|urdu\s*(mein?|mai|bol)?)/i, lang: 'ur', langName: 'Urdu' },
        { pattern: /\b(nepali|nepali\s*(ma|maa)?)/i, lang: 'ne', langName: 'Nepali' },
        { pattern: /\b(english|ingl(?:ish|i)\s*(lo|mein?|ma)?)/i, lang: 'en', langName: 'English' }
    ];
    
    let requestedLang = null;
    for (const lp of langRequestPatterns) {
        if (lp.pattern.test(message)) {
            requestedLang = lp;
            break;
        }
    }
    
    // If user explicitly requested a language, respond accordingly
    if (requestedLang) {
        const langGreetings = {
            'hi': '\u092E\u0948\u0902 \u0905\u092C \u0938\u0947 \u0939\u093F\u0902\u0926\u0940 \u092E\u0947\u0902 \u092C\u093E\u0924 \u0915\u0930\u0942\u0902\u0917\u093E\u0964 \u0906\u092A\u0915\u094B \u0915\u0948\u0938\u0947 \u092E\u0926\u0926 \u0915\u0930 \u0938\u0915\u0924\u0940 \u0939\u0942\u0902\u0964 \u0906\u092A \u0915\u094D\u092F\u093E \u092A\u0942\u091B\u0928\u093E \u091A\u093E\u0939\u0924\u0947 \u0939\u0948\u0902?',
            'ta': '\u0B87\u0BA9\u0BCD\u0BB5\u0BBF \u0B87\u0BAA\u0BCd\u0BAA\u0BCC\u0B9F\u0BC1 \u0B9F\u0BBE\u0B95\u0BCd\u0B9F\u0BB0\u0BCD \u0B89\u0B99\u0BCd\u0B95\u0BB3\u0BCD \u0B87\u0BB0\u0BC1\u0B95\u0BCd\u0B95\u0BB2\u0BCD. \u0B89\u0B99\u0BCd\u0B95\u0BB3\u0BCd \u0B8E\u0BA9\u0BCd\u0BA4\u0BB2\u0BCD \u0BAE\u0BC7\u0BB2\u0BCD \u0B89\u0BA4\u0BB5\u0BBF \u0B9A\u0BC6\u0BAF\u0BCd\u0BB5\u0BBF\u0BAA\u0BBF\u0B9F\u0BCd\u0BA4\u0BC1 \u0B89\u0B99\u0BCd\u0B95\u0BB3\u0BCd. \u0B89\u0B99\u0BCd\u0B95\u0BB2\u0BCd \u0B8E\u0BA9\u0BCd\u0BA4 \u0B8E\u0BA9\u0BCd\u0BA4\u0BB2\u0BCd \u0BAE\u0BC7\u0BB2\u0BCd \u0BAE\u0BC1\u0BB4\u0BCd\u0BB2\u0BBE\u0B95 \u0BAE\u0BC1\u0B9F\u0BBF\u0BAF\u0BBE?',
            'bn': '\u09A6\u09C1\u09B9\u09C0\u09A8\u09A4\u09C7 \u09A4\u09BE \u09A6\u09C1\u0997\u09CD\u09A4\u09B0 \u09AC\u09BE\u0982\u09B2\u09BE \u0995\u09B0\u09A4\u09C7 \u099B\u09BF\u09B2\u09C7\u099B\u09CD\u099B\u09C7\u0964 \u0986\u09AA\u09A8\u09BE\u0995\u09C7 \u0995\u09BF\u09AD\u09BE\u09AC\u09C7 \u09B8\u09BE\u09B9\u09BE\u09AF\u09CD\u09AF \u0995\u09B0\u09A4\u09C7 \u09AA\u09BE\u09B0\u09BF?',
            'en': 'Hello! I can speak in English. How can I help you today?'
        };
        
        const responseMsg = langGreetings[requestedLang.lang] || langGreetings['en'];
        
        // Build a report response in requested language if report context exists
        let reportPart = '';
        if (reportContext && reportContext.tests && reportContext.tests.length > 0) {
            const tests = reportContext.tests;
            if (requestedLang.lang === 'hi') {
                reportPart = '\n\n**\u0906\u092A\u0915\u0940 \u0930\u093F\u092A\u094B\u0930\u094D\u091F:**\n\n';
                for (const test of tests) {
                    const icon = test.status === 'normal' ? '\u2705' : test.status === 'high' ? '\u2B06\uFE0F' : '\u2B07\uFE0F';
                    reportPart += icon + ' **' + test.name + '**: ' + test.value + ' ' + (test.unit || '');
                    if (test.referenceRange) reportPart += ' (\u0938\u093E\u092E\u093E\u0928\u094D\u092F: ' + test.referenceRange + ')';
                    reportPart += '\n';
                }
                const abnormal = tests.filter(t => t.status === 'high' || t.status === 'low');
                const normal = tests.filter(t => t.status === 'normal');
                if (abnormal.length > 0) {
                    reportPart += '\n**\u26A0\uFE0F \u0905\u0938\u093E\u092E\u093E\u0928\u094D\u092F \u092E\u093E\u0928:**\n';
                    for (const t of abnormal) {
                        const dir = t.status === 'high' ? '\u091C\u094D\u092F\u093E\u0926\u093E' : '\u0915\u092E';
                        reportPart += '- **' + t.name + '**: ' + t.value + ' (' + dir + ')\n';
                    }
                }
                if (normal.length > 0) {
                    reportPart += '\n**\u2705 \u0938\u093E\u092E\u093E\u0928\u094D\u092F \u092E\u093E\u0928:**\n';
                    for (const t of normal) {
                        reportPart += '- ' + t.name + ': ' + t.value + '\n';
                    }
                }
                reportPart += '\n\u0915\u0943\u092A\u092F\u093E \u0907\u0928\u094D\u0939\u0947\u0902 \u0905\u092A\u0928\u0947 \u0921\u0949\u0915\u094D\u091F\u0930 \u0938\u0947 \u0926\u093F\u0916\u093E\u090F\u0902\u0964\n\n';
            } else if (requestedLang.lang === 'ta') {
                reportPart = '\n\n**\u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0B9A\u0BBF\u0BB1\u0BBF\u0BAA\u0BCd\u0BAA\u0BC1:**\n\n';
                for (const test of tests) {
                    const icon = test.status === 'normal' ? '\u2705' : test.status === 'high' ? '\u2B06\uFE0F' : '\u2B07\uFE0F';
                    reportPart += icon + ' **' + test.name + '**: ' + test.value + ' ' + (test.unit || '');
                    if (test.referenceRange) reportPart += ' (\u0B87\u0BAF\u0BB2\u0BCD: ' + test.referenceRange + ')';
                    reportPart += '\n';
                }
                const abnormal = tests.filter(t => t.status === 'high' || t.status === 'low');
                const normal = tests.filter(t => t.status === 'normal');
                if (abnormal.length > 0) {
                    reportPart += '\n**\u26A0\uFE0F \u0B87\u0BAF\u0BB2\u0BCD\u0BAA\u0BCd\u0B9F\u0BBE\u0B95\u0BAE\u0BCd \u0BAE\u0BA4\u0BBF\u0B95\u0B99\u0BCd\u0B95\u0BB3\u0BCD:**\n';
                    for (const t of abnormal) {
                        const dir = t.status === 'high' ? '\u0B85\u0BA4\u0BBF\u0B95\u0BAE\u0BCd' : '\u0B95\u0BC1\u0BB1\u0BC8';
                        reportPart += '- **' + t.name + '**: ' + t.value + ' (' + dir + ')\n';
                    }
                }
                if (normal.length > 0) {
                    reportPart += '\n**\u2705 \u0B87\u0BAF\u0BB2\u0BCD \u0BAE\u0BA4\u0BBF\u0B95\u0B99\u0BCd\u0B95\u0BB3\u0BCD:**\n';
                    for (const t of normal) {
                        reportPart += '- ' + t.name + ': ' + t.value + '\n';
                    }
                }
                reportPart += '\n\u0B89\u0B99\u0BCd\u0B95\u0BB3\u0BCd \u0B9F\u0BBE\u0B95\u0BCd\u0B9F\u0BB0\u0BCD \u0B95\u0BBE\u0BA3\u0BCd\u0BB4\u0BBF \u0B9A\u0BC6\u0BAF\u0BCd\u0BB5\u0BBF\u0BAA\u0BBF\u0B9F\u0BCd\u0BA4\u0BC1 \u0BAE\u0BB1\u0BCd\u0B9A\u0BC1\u0B9F\u0BC6 \u0B95\u0BC2\u0BB1\u0BCd\u0BB1\u0B9F\u0BC1\u0B9F\u0BC8\u0964\n\n';
            }
        }
        
        return {
            response: responseMsg + reportPart,
            type: 'language_switch',
            sources: [],
            detectedLanguage: requestedLang.lang,
            languageSwitch: requestedLang.lang,
            languageName: requestedLang.langName
        };
    }

    // ── Report Context: Use uploaded report data when available ────────────
    if (reportContext && reportContext.tests && reportContext.tests.length > 0) {
        const reportKeywords = ['report', 'result', 'value', 'explain', 'summarize', 'abnormal', 'normal', 'doctor', 'mean', 'samjhao', 'padho', 'batao', 'dikkat', 'problem', 'hemoglobin', 'sugar', 'cholesterol', 'platelet', 'wbc', 'rbc', 'creatinine', 'urea', 'viriperu', 'vilai', 'vilaiyai', 'vivaram', 'saram', 'maruthuvar', 'sigaram', 'poruleludhi'];
        const isReportQuery = reportKeywords.some(kw => lowerMessage.includes(kw));

        if (isReportQuery) {
            const tests = reportContext.tests;
            const reportType = reportContext.reportType || 'Medical Report';
            const reportTypeData = reportContext.reportTypeData || null;

            // Find abnormal values
            const abnormal = tests.filter(t => t.status === 'high' || t.status === 'low');
            const normal = tests.filter(t => t.status === 'normal');

            let response = '';
            const lang = detectedLang || 'en';

            // Build response based on language
            if (lang === 'hi' || lang === 'hi-IN') {
                response = '**आपकी ' + reportType + ' रिपोर्ट:**\n\n';

                response += '**परीक्षण परिणाम:**\n';
                for (const test of tests) {
                    const icon = test.status === 'normal' ? '✅' : test.status === 'high' ? '⬆️' : '⬇️';
                    response += icon + ' **' + test.name + '**: ' + test.value + ' ' + (test.unit || '');
                    if (test.referenceRange) response += ' (सामान्य: ' + test.referenceRange + ')';
                    response += '\n';
                }
                response += '\n';

                if (abnormal.length > 0) {
                    response += '**⚠️ असामान्य मान:**\n';
                    for (const t of abnormal) {
                        const dir = t.status === 'high' ? 'ज्यादा' : 'कम';
                        response += '- **' + t.name + '**: ' + t.value + ' ' + (t.unit || '') + ' (' + dir + ')\n';
                        if (t.explanation) response += '  ' + t.explanation + '\n';
                    }
                    response += '\n';
                }

                if (normal.length > 0) {
                    response += '**✅ सामान्य मान:**\n';
                    for (const t of normal) {
                        response += '- ' + t.name + ': ' + t.value + ' ' + (t.unit || '') + '\n';
                    }
                    response += '\n';
                }

                if (lowerMessage.includes('doctor') || lowerMessage.includes('batana') || lowerMessage.includes('dikhana') || lowerMessage.includes('puchna')) {
                    response += '**डॉक्टर से क्या बात करें:**\n';
                    if (abnormal.length > 0) {
                        response += '- असामान्य मानों के बारे में पूछें\n';
                        response += '- क्या कोई उपचार या जीवनशैली में बदलाव आवश्यक है\n';
                    }
                    response += '- अगली जांच कब करवानी है\n';
                    response += '- कोई और सवाल जो आपके मन में हैं\n\n';
                } else if (lowerMessage.includes('summary') || lowerMessage.includes('summarize') || lowerMessage.includes('sara')) {
                    response += '**सारांश:**\n';
                    response += '- कुल ' + tests.length + ' परीक्षण किए गए\n';
                    response += '- ' + normal.length + ' सामान्य\n';
                    if (abnormal.length > 0) response += '- ' + abnormal.length + ' असामान्य\n';
                    response += '\n';
                }

                response += '⚠️ कृपया इन परिणामों को अपने डॉक्टर को दिखाएं और व्यक्तिगत सलाह के लिए उनसे बात करें।\n\n';
                response += DISCLAIMER;
            } else if (lang === 'bn') {
                response = '**আপনার ' + reportType + ' রিপোর্ট:**\n\n';
                response += '**পরীক্ষার ফলাফল:**\n';
                for (const test of tests) {
                    const icon = test.status === 'normal' ? '✅' : test.status === 'high' ? '⬆️' : '⬇️';
                    response += icon + ' **' + test.name + '**: ' + test.value + ' ' + (test.unit || '');
                    if (test.referenceRange) response += ' (স্বাভাবিক: ' + test.referenceRange + ')';
                    response += '\n';
                }
                response += '\n⚠️ অনুগ্রহ করে এই ফলাফলগুলি আপনার ডাক্তারকে দেখান।\n\n' + DISCLAIMER;
            } else if (lang === 'ta') {
                response = '**\u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BCD\u0B95\u0BC1 ' + reportType + ' \u0B9A\u0BBF\u0BB1\u0BBF\u0BAA\u0BCD\u0BAA\u0BC1:**\n\n';

                response += '**\u0B9A\u0B9A\u0BCd\u0B9F\u0BC1\u0BAA\u0BCd\u0BAA\u0BC1 \u0BAA\u0BC6\u0BB1\u0BCd\u0BB1\u0BAA\u0BCd\u0BAA\u0BC1:**\n';
                for (const test of tests) {
                    const icon = test.status === 'normal' ? '\u2705' : test.status === 'high' ? '\u2B06\uFE0F' : '\u2B07\uFE0F';
                    response += icon + ' **' + test.name + '**: ' + test.value + ' ' + (test.unit || '');
                    if (test.referenceRange) response += ' (\u0B87\u0BAF\u0BB2\u0BCd: ' + test.referenceRange + ')';
                    response += '\n';
                }
                response += '\n';

                if (abnormal.length > 0) {
                    response += '**\u26A0\uFE0F \u0B87\u0BAF\u0BB2\u0BCd\u0BAA\u0BCd\u0B9F\u0BBE\u0B95\u0BAE\u0BCd \u0BAE\u0BA4\u0BBF\u0B95\u0B99\u0BCd\u0B95\u0BB3\u0BCd:**\n';
                    for (const t of abnormal) {
                        const dir = t.status === 'high' ? '\u0B85\u0BA4\u0BBF\u0B95\u0BAE\u0BCd' : '\u0B95\u0BC1\u0BB1\u0BC8';
                        response += '- **' + t.name + '**: ' + t.value + ' ' + (t.unit || '') + ' (' + dir + ')\n';
                        if (t.explanation) response += '  ' + t.explanation + '\n';
                    }
                    response += '\n';
                }

                if (normal.length > 0) {
                    response += '**\u2705 \u0B87\u0BAF\u0BB2\u0BCd \u0BAE\u0BA4\u0BBF\u0B95\u0B99\u0BCd\u0B95\u0BB3\u0BCd:**\n';
                    for (const t of normal) {
                        response += '- ' + t.name + ': ' + t.value + ' ' + (t.unit || '') + '\n';
                    }
                    response += '\n';
                }

                response += '\u26A0\uFE0F \u0B87\u0BA8\u0BCd\u0BA4 \u0BAA\u0BC6\u0BB1\u0BCd\u0BB1\u0BAA\u0BCd\u0B9A\u0BC1\u0B95\u0BB3\u0BCD\u0BB2\u0BCd \u0B89\u0B99\u0BCd\u0B95\u0BB3\u0BCd \u0B9F\u0BBE\u0B95\u0BCd\u0B9F\u0BB0\u0BCd \u0B95\u0BBE\u0BA3\u0BCd\u0BB4\u0BBF \u0B9A\u0BC6\u0BAF\u0BCd\u0BB5\u0BBF\u0BAA\u0BBF\u0B9F\u0BCd\u0B9F\u0BC1 \u0BAE\u0BB1\u0BCd\u0B9A\u0BC1\u0B9F\u0BC6 \u0B95\u0BCd\u0B9F\u0BBF\u0BB0\u0BCd\u0BAF\u0BBE\u0B95 \u0B9A\u0BC6\u0BAF\u0BCd\u0BAA\u0BAA\u0BCd\u0B9F\u0BC1\u0BAA\u0BBF\u0B9F\u0BCd\u0BA4\u0BC1 \u0BAE\u0BB1\u0BCd\u0B9A\u0BC1\u0B9F\u0BC6 \u0B95\u0BC2\u0BB1\u0BCd\u0BB1\u0B9F\u0BC1\u0B9F\u0BC8.\n\n';
                response += DISCLAIMER;
            } else {
                // English and other languages
                response = '**Your ' + reportType + '**\n\n';

                response += '**Test Results:**\n';
                for (const test of tests) {
                    const icon = test.status === 'normal' ? '✅' : test.status === 'high' ? '⬆️' : '⬇️';
                    response += icon + ' **' + test.name + '**: ' + test.value + ' ' + (test.unit || '');
                    if (test.referenceRange) response += ' (Ref: ' + test.referenceRange + ')';
                    response += '\n';
                }
                response += '\n';

                if (abnormal.length > 0) {
                    response += '**⚠️ Abnormal Values:**\n';
                    for (const t of abnormal) {
                        const dir = t.status === 'high' ? 'High' : 'Low';
                        response += '- **' + t.name + '**: ' + t.value + ' ' + (t.unit || '') + ' (' + dir + ')\n';
                        if (t.explanation) response += '  ' + t.explanation + '\n';
                    }
                    response += '\n';
                }

                if (normal.length > 0) {
                    response += '**✅ Normal Values:**\n';
                    for (const t of normal) {
                        response += '- ' + t.name + ': ' + t.value + ' ' + (t.unit || '') + '\n';
                    }
                    response += '\n';
                }

                if (lowerMessage.includes('doctor') || lowerMessage.includes('ask') || lowerMessage.includes('discuss')) {
                    response += '**Questions to ask your doctor:**\n';
                    if (abnormal.length > 0) {
                        response += '- What do the abnormal values mean?\n';
                        response += '- Is any treatment or lifestyle change needed?\n';
                    }
                    response += '- When should I get my next test?\n';
                    response += '- Are there any other concerns?\n\n';
                } else if (lowerMessage.includes('summarize') || lowerMessage.includes('summary')) {
                    response += '**Summary:**\n';
                    response += '- ' + tests.length + ' tests performed\n';
                    response += '- ' + normal.length + ' within normal range\n';
                    if (abnormal.length > 0) response += '- ' + abnormal.length + ' abnormal\n';
                    response += '\n';
                }

                response += '⚠️ Please share these results with your healthcare provider for personalized guidance.\n\n';

                // Type-specific quick actions
                const quickActions = getReportTypeQuickActions(reportTypeData, tests);
                if (quickActions.length > 0) {
                    response += '**Quick Actions:**\n';
                    for (const action of quickActions) {
                        response += `- ${action}\n`;
                    }
                    response += '\n';
                }

                response += DISCLAIMER;
            }

            return {
                response: response,
                type: 'report_analysis',
                sources: [],
                detectedLanguage: detectedLang,
                reportUsed: true
            };
        }
    }

    // ── RAG Integration: Try knowledge base first ──────────────────────────
    try {
        const medicalKnowledgeService = require('./medical-knowledge-service');
        const ragContext = Object.assign({}, context, { conversationLanguage: detectedLang, detectedLanguage: detectedLang });
        const ragResult = await medicalKnowledgeService.generateRAGResponse(message, ragContext);

        // If RAG returned a response (medical query with knowledge), use it
        if (ragResult.response !== null) {
            return {
                response: langPrefix + ragResult.response + langSuffix,
                type: 'rag',
                sources: ragResult.sources || [],
                severity: ragResult.safetyFlag ? 'emergency' : undefined,
                detectedLanguage: detectedLang,
                ragMetadata: {
                    intent: ragResult.intent,
                    topics: ragResult.topics,
                    evidence: ragResult.evidence,
                    chunksUsed: ragResult.chunksUsed,
                    latencyMs: ragResult.latencyMs
                }
            };
        }
        // If RAG returned null, it's a non-medical query — fall through to existing logic
    } catch (ragErr) {
        // RAG service unavailable or error — fall through to existing logic
        console.warn('RAG service unavailable, using fallback:', ragErr.message);
    }

    // ── Existing Fallback Logic ────────────────────────────────────────────

    const emergencyCheck = detectEmergency(message);
    if (emergencyCheck.isEmergency) {
        return {
            response: langPrefix + emergencyCheck.message + '\n\n' + emergencyCheck.advice + '\n\n' + EMERGENCY_DISCLAIMER,
            type: 'emergency',
            sources: [],
            severity: emergencyCheck.severity,
            detectedLanguage: detectedLang
        };
    }

    if ((lowerMessage.includes('report') || lowerMessage.includes('result') || lowerMessage.includes('lab value') || lowerMessage.includes('test result')) && !reportContext) {
        const analysis = analyzeText(message);
        return {
            response: langPrefix + `I understand you're asking about medical report results. Based on the keywords in your message:\n\n` +
                (analysis.symptomPatterns.length > 0
                    ? `Related medical topics detected: ${analysis.symptomPatterns.map(sp => sp.category).join(', ')}\n\n`
                    : '') +
                'To properly analyze a medical report, please use the report upload feature. I can analyze:\n' +
                '- Blood test results\n' +
                '- Lab reports\n' +
                '- Medical imaging reports\n' +
                '- Prescription information\n\n' +
                'Once you upload a document, I\'ll provide a structured analysis with findings, explanations, and suggested questions for your doctor.\n\n' +
                DISCLAIMER + langSuffix,
            type: 'analysis',
            sources: [],
            detectedLanguage: detectedLang
        };
    }

    const symptomKeywords = [
        'pain', 'hurt', 'ache', 'sore', 'fever', 'cough', 'headache',
        'nausea', 'vomiting', 'diarrhea', 'constipation', 'dizzy', 'fatigue',
        'weak', 'tired', 'rash', 'itch', 'swelling', 'numbness', 'tingling',
        'shortness of breath', 'chest pain', 'stomach', 'joint', 'muscle',
        'symptom', 'feel', 'feeling', 'experiencing', 'having', 'suffering'
    ];

    const hasSymptomKeywords = symptomKeywords.some(keyword => lowerMessage.includes(keyword));

    if (hasSymptomKeywords) {
        const analysis = analyzeText(message);
        let responseText = '';

        if (analysis.isEmergency) {
            responseText = analysis.emergencyAdvice + '\n\n';
        }

        responseText += 'Based on your description, here\'s what I can share:\n\n';

        if (analysis.symptomPatterns.length > 0) {
            responseText += '**Symptoms detected:**\n';
            for (const sp of analysis.symptomPatterns) {
                responseText += `- ${sp.category.charAt(0).toUpperCase() + sp.category.slice(1)}: ${sp.symptoms.join(', ')}\n`;
            }
            responseText += '\n';
        }

        if (analysis.termExplanations && analysis.termExplanations.length > 0) {
            responseText += '**Medical terms explained:**\n';
            for (const te of analysis.termExplanations) {
                responseText += `- **${te.term}**: ${te.explanation}\n`;
            }
            responseText += '\n';
        }

        responseText += '**What you can do:**\n';
        for (const rec of analysis.recommendations) {
            responseText += `- ${rec}\n`;
        }

        responseText += '\nPlease discuss these findings with your healthcare provider for personalized advice.';
        responseText += DISCLAIMER;

        return {
            response: langPrefix + responseText,
            type: 'analysis',
            sources: [],
            detectedLanguage: detectedLang
        };
    }

    const medicalTerms = [
        'what is', 'what are', 'define', 'explain', 'meaning',
        'symptom', 'condition', 'disease', 'disorder', 'treatment',
        'medication', 'drug', 'side effect', 'diagnosis', 'prognosis',
        'therapy', 'surgery', 'test', 'procedure', 'vaccine',
        'blood pressure', 'cholesterol', 'diabetes', 'cancer',
        'heart', 'lung', 'liver', 'kidney', 'brain', 'stomach',
        'infection', 'inflammation', 'allergy', 'immune'
    ];

    const isMedicalQuestion = medicalTerms.some(term => lowerMessage.includes(term));

    if (isMedicalQuestion) {
        let responseText = '';

        if (lowerMessage.includes('what is') || lowerMessage.includes('what are') || lowerMessage.includes('define') || lowerMessage.includes('explain')) {
            const termToDefine = message.replace(/what is\s*/i, '').replace(/what are\s*/i, '').replace(/define\s*/i, '').replace(/explain\s*/i, '').trim();

            const foundTerm = Object.entries(MEDICAL_KB.medicalTerms).find(([term]) =>
                lowerMessage.includes(term.toLowerCase())
            );

            if (foundTerm) {
                responseText = `**${foundTerm[0]}**\n\n${foundTerm[1]}\n\n` +
                    'This is a general medical explanation. For personalized medical advice, please consult with a healthcare professional.\n\n' +
                    DISCLAIMER;
            } else if (termToDefine.length > 2) {
                responseText = `I can provide general information about medical topics, but I want to be careful not to provide specific medical advice.\n\n` +
                    `Regarding "${termToDefine}": I don't have a specific definition for this in my knowledge base, but I can tell you that medical terminology is complex and contextual. ` +
                    'The best source for understanding medical terms related to your specific situation is your healthcare provider, who can explain terms in the context of your health.\n\n' +
                    DISCLAIMER;
            } else {
                responseText = 'Could you please specify which medical term or condition you\'d like me to explain?\n\n' + DISCLAIMER;
            }
        } else {
            responseText = 'I can provide general health information, but I want to emphasize important limitations:\n\n' +
                '**What I can do:**\n' +
                '- Explain general medical concepts and terminology\n' +
                '- Help you understand medical reports\n' +
                '- Suggest questions to ask your doctor\n' +
                '- Help you organize your health information\n\n' +
                '**What I cannot do:**\n' +
                '- Provide a medical diagnosis\n' +
                '- Recommend specific treatments or medications\n' +
                '- Replace the advice of a qualified healthcare professional\n' +
                '- Interpret results in the context of your unique medical history\n\n' +
                '**To best help you, please consider:**\n' +
                '- Sharing specific symptoms with your doctor\n' +
                '- Bringing a list of questions to your next appointment\n' +
                '- Keeping a health diary to track changes\n\n' +
                DISCLAIMER;
        }

        return {
            response: langPrefix + responseText,
            type: 'text',
            sources: [],
            detectedLanguage: detectedLang
        };
    }

    const greetingPatterns = /^(hi|hello|hey|good\s*(morning|afternoon|evening)|howdy|greetings|shrijal)/i;
    if (greetingPatterns.test(lowerMessage)) {
        const isDoctor = context && context.role === 'doctor';
        const isPatient = !isDoctor;
        
        let greeting = 'Hi! I\'m Shrijal 👋\n\n';
        greeting += 'I\'m your AI Medical Assistant. I\'m here to help you understand your medical reports, symptoms, and general health information.\n\n';
        
        if (isDoctor) {
            greeting += '**As a medical professional, I can help you with:**\n';
            greeting += '- Summarizing patient reports\n';
            greeting += '- Highlighting abnormal values\n';
            greeting += '- Extracting key findings\n';
            greeting += '- Comparing reports\n';
            greeting += '- Preparing discussion points\n\n';
            greeting += 'Please remember that I\'m an AI assistant to support your clinical decision-making, not replace it.';
        } else {
            greeting += '**I can help you with:**\n';
            greeting += '- Understanding medical reports and lab results\n';
            greeting += '- Explaining medical terms in simple language\n';
            greeting += '- Discussing symptoms and general health\n';
            greeting += '- Organizing health information\n\n';
            greeting += 'Don\'t worry, I\'ll help you understand everything. Just remember to confirm important decisions with your doctor.';
        }
        
        greeting += '\n\nHow can I help you today?';
        
        return {
            response: greeting,
            type: 'text',
            sources: [],
            detectedLanguage: detectedLang
        };
    }

    const helpPatterns = /^(help|what can you do|capabilities|features|how do (you|i))/i;
    if (helpPatterns.test(lowerMessage)) {
        const isDoctor = context && context.role === 'doctor';
        let responseText = '**Shrijal — AI Medical Assistant**\n\n';
        
        if (isDoctor) {
            responseText += '**Doctor Mode:**\n';
            responseText += '- Analyze and summarize patient reports\n';
            responseText += '- Highlight abnormal values with severity\n';
            responseText += '- Extract key clinical findings\n';
            responseText += '- Compare multiple reports\n';
            responseText += '- Prepare discussion points for patient consultations\n';
            responseText += '- Explain medical terminology\n\n';
        } else {
            responseText += '**What I can do:**\n';
            responseText += '- Analyze medical reports in plain language\n';
            responseText += '- Explain what lab values mean\n';
            responseText += '- Help you understand symptoms\n';
            responseText += '- Detect potential emergencies\n';
            responseText += '- Suggest questions for your doctor\n\n';
        }
        
        responseText += '**Voice Commands:**\n';
        responseText += '- "Read this report" — I\'ll read the analysis aloud\n';
        responseText += '- "Explain this report" — Detailed explanation\n';
        responseText += '- "Clear chat" — Start fresh\n';
        responseText += '- "Stop speaking" — Stop voice output\n\n';
        
        responseText += 'How can I help you today?';
        responseText += DISCLAIMER;
        
        return { response: langPrefix + responseText, type: 'text', sources: [], detectedLanguage: detectedLang };
    }

    const thankPatterns = /^(thanks?|thank you|thx|appreciate)/i;
    if (thankPatterns.test(lowerMessage)) {
        return {
            response: langPrefix + 'You\'re welcome! I\'m glad I could help. Remember, I\'m always here if you have more questions about your health or medical reports.\n\nIs there anything else I can help you with?' + DISCLAIMER + langSuffix,
            type: 'text',
            sources: [],
            detectedLanguage: detectedLang
        };
    }

    const goodbyePatterns = /^(bye|goodbye|see you|take care|farewell)/i;
    if (goodbyePatterns.test(lowerMessage)) {
        return {
            response: langPrefix + 'Take care! Remember to follow up with your healthcare provider for any medical decisions. I\'m here whenever you need me.\n\nStay healthy!' + langSuffix,
            type: 'text',
            sources: [],
            detectedLanguage: detectedLang
        };
    }

    return {
        response: langPrefix + 'I want to make sure I give you the most helpful information. Could you tell me more about what you need?\n\n' +
            '**You can ask me to:**\n' +
            '- Analyze a medical report (upload a file)\n' +
            '- Explain medical terms\n' +
            '- Discuss symptoms\n' +
            '- Detect potential emergencies\n\n' +
            'Or just type your health question below.' + DISCLAIMER + langSuffix,
        type: 'text',
        sources: [],
        detectedLanguage: detectedLang
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
    analyzeReport,
    analyzeSymptomPhoto,
    analyzeText,
    chat,
    detectEmergency,
    validateFile,
    classifyDocument,
    MEDICAL_KB,
    DISCLAIMER,
    EMERGENCY_DISCLAIMER,
    reportTypeAnalyzer
};
