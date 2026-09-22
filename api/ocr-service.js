const sharp = require('sharp');
const Tesseract = require('tesseract.js');
const path = require('path');
const fs = require('fs');

// ─────────────────────────────────────────────────────────────────────────────
// OCR + Medical Report Reading Pipeline
// ─────────────────────────────────────────────────────────────────────────────

// Medical keywords for report detection
const MEDICAL_KEYWORDS = [
    'test', 'lab', 'laboratory', 'report', 'result', 'patient', 'doctor',
    'blood', 'urine', 'serum', 'plasma', 'specimen', 'collection',
    'hemoglobin', 'hematocrit', 'wbc', 'rbc', 'platelet', 'glucose',
    'cholesterol', 'triglyceride', 'creatinine', 'urea', 'bun',
    'sodium', 'potassium', 'chloride', 'calcium', 'magnesium',
    'bilirubin', 'albumin', 'protein', 'alt', 'ast', 'alp',
    'tsh', 't3', 't4', 'thyroid', 'hba1c', 'hgb', 'hct',
    'mch', 'mchc', 'mcv', 'rdw', 'esr', 'crp',
    'cbc', 'lft', 'kft', 'lipid', 'thyroid', 'diabetes',
    'pathology', 'radiology', 'x-ray', 'xray', 'mri', 'ct', 'scan',
    'ultrasound', 'ecg', 'ekg', 'echo', 'biopsy',
    'normal', 'abnormal', 'high', 'low', 'elevated', 'decreased',
    'reference', 'range', 'unit', 'flag', 'critical', 'positive', 'negative',
    'impression', 'conclusion', 'finding', 'observation', 'diagnosis',
    'hospital', 'clinic', 'medical', 'health', 'healthcare',
    'mg/dl', 'g/dl', '/ul', '/mcl', 'mmol/l', 'mmhg', 'miu/l', 'u/l',
    'ng/ml', 'pg/ml', 'iu/ml', '%', 'meq/l',
    'date', 'name', 'age', 'sex', 'gender', 'male', 'female',
    'fasting', 'random', 'overnight', 'sample'
];

// Non-medical image indicators
const NON_MEDICAL_INDICATORS = [
    'selfie', 'food', 'restaurant', 'menu', 'recipe',
    'landscape', 'mountain', 'beach', 'sunset', 'sunrise',
    'animal', 'pet', 'dog', 'cat', 'bird',
    'car', 'vehicle', 'road', 'traffic',
    'building', 'house', 'apartment', 'room',
    'shopping', 'product', 'price', 'sale',
    'game', 'sport', 'music', 'concert',
    'meme', 'funny', 'joke', 'comic'
];

// ─────────────────────────────────────────────────────────────────────────────
// 1. Image Preprocessing with Sharp
// ─────────────────────────────────────────────────────────────────────────────

async function preprocessImage(imagePath) {
    const outputPath = imagePath + '_preprocessed.png';

    try {
        const metadata = await sharp(imagePath).metadata();

        let pipeline = sharp(imagePath);

        // Auto-rotate based on EXIF orientation
        pipeline = pipeline.rotate();

        // Resize if too small (OCR needs reasonable resolution)
        const minDimension = 1500;
        if (metadata.width && metadata.height) {
            const maxDim = Math.max(metadata.width, metadata.height);
            if (maxDim < minDimension) {
                const scale = minDimension / maxDim;
                pipeline = pipeline.resize({
                    width: Math.round(metadata.width * scale),
                    height: Math.round(metadata.height * scale),
                    kernel: sharp.kernel.lanczos3
                });
            }
        }

        // Convert to grayscale for better OCR
        pipeline = pipeline.grayscale();

        // Increase contrast and sharpen for text readability
        pipeline = pipeline.normalize();

        // Sharpen to improve text edges
        pipeline = pipeline.sharpen({
            sigma: 1.5,
            m1: 1.0,
            m2: 0.5
        });

        // Apply slight threshold to make text more distinct
        pipeline = pipeline.threshold(128);

        // Ensure output is PNG for tesseract
        await pipeline.png().toFile(outputPath);

        return outputPath;
    } catch (error) {
        console.error('Image preprocessing failed:', error.message);
        // Return original image if preprocessing fails
        return imagePath;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. OCR with Tesseract.js
// ─────────────────────────────────────────────────────────────────────────────

async function performOCR(imagePath) {
    try {
        const result = await Tesseract.recognize(imagePath, 'eng', {
            logger: m => {
                if (m.status === 'recognizing text') {
                    // Progress callback if needed
                }
            }
        });

        const text = result.data.text || '';
        const confidence = result.data.confidence || 0;

        // Also get word-level data for table detection
        const words = [];
        const lines = [];

        if (result.data.blocks) {
            for (const block of result.data.blocks) {
                for (const paragraph of block.paragraphs) {
                    let lineText = '';
                    for (const line of paragraph.lines) {
                        let lineConfidence = 0;
                        let wordCount = 0;
                        for (const word of line.words) {
                            words.push({
                                text: word.text,
                                confidence: word.confidence,
                                bbox: word.bbox
                            });
                            lineText += word.text + ' ';
                            lineConfidence += word.confidence;
                            wordCount++;
                        }
                        lines.push({
                            text: lineText.trim(),
                            confidence: wordCount > 0 ? lineConfidence / wordCount : 0
                        });
                    }
                }
            }
        }

        return {
            text,
            confidence,
            words,
            lines,
            wordCount: words.length,
            lineCount: lines.length
        };
    } catch (error) {
        console.error('OCR failed:', error.message);
        return {
            text: '',
            confidence: 0,
            words: [],
            lines: [],
            wordCount: 0,
            lineCount: 0,
            error: error.message
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Medical Report Detection
// ─────────────────────────────────────────────────────────────────────────────

function detectMedicalReport(text) {
    const lowerText = text.toLowerCase();
    let medicalScore = 0;
    let matchedKeywords = [];

    for (const keyword of MEDICAL_KEYWORDS) {
        if (lowerText.includes(keyword.toLowerCase())) {
            medicalScore++;
            matchedKeywords.push(keyword);
        }
    }

    // Check for lab value patterns (number + unit)
    const labValuePatterns = [
        /\d+\.?\d*\s*mg\/dL/gi,
        /\d+\.?\d*\s*g\/dL/gi,
        /\d+\.?\d*\s*\/\s*[µu]L/gi,
        /\d+\.?\d*\s*mmol\/L/gi,
        /\d+\.?\d*\s*mmHg/gi,
        /\d+\.?\d*\s*mIU\/L/gi,
        /\d+\.?\d*\s*U\/L/gi,
        /\d+\.?\d*\s*ng\/mL/gi,
        /\d+\.?\d*\s*pg\/mL/gi,
        /\d+\.?\d*\s*meq\/L/gi,
        /\d+\.?\d*\s*%\s/gi
    ];

    let labValueCount = 0;
    for (const pattern of labValuePatterns) {
        const matches = lowerText.match(pattern);
        if (matches) labValueCount += matches.length;
    }

    // Check for table-like structure
    const hasTable = /\|.*\|/.test(text) || /\t/.test(text) ||
                     (text.split('\n').filter(l => l.includes('|') || l.includes('\t')).length > 3);

    // Check for header-like patterns
    const hasHeaders = /test\s*(name|result|value)/i.test(text) ||
                       /result\s*(s|status|value)/i.test(text) ||
                       /reference\s*(range|values)/i.test(text) ||
                       /normal\s*(range|values)/i.test(text);

    const totalScore = medicalScore + (labValueCount * 3) + (hasTable ? 5 : 0) + (hasHeaders ? 5 : 0);

    return {
        isMedical: totalScore >= 3,
        confidence: Math.min(totalScore * 5, 100),
        score: totalScore,
        matchedKeywords: matchedKeywords.slice(0, 10),
        labValueCount,
        hasTable,
        hasHeaders
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Non-Medical Image Detection
// ─────────────────────────────────────────────────────────────────────────────

function detectNonMedical(text) {
    const lowerText = text.toLowerCase();
    let nonMedicalScore = 0;
    let matchedIndicators = [];

    for (const indicator of NON_MEDICAL_INDICATORS) {
        if (lowerText.includes(indicator.toLowerCase())) {
            nonMedicalScore++;
            matchedIndicators.push(indicator);
        }
    }

    return {
        isNonMedical: nonMedicalScore >= 3,
        score: nonMedicalScore,
        matchedIndicators
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Structured Medical Data Extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractStructuredData(text, lines) {
    const tests = [];
    const sections = [];
    let reportType = 'Medical Report';
    let date = '';
    let hospitalName = '';

    // Detect report type
    const lowerText = text.toLowerCase();
    if (lowerText.includes('complete blood') || lowerText.includes(' cbc')) reportType = 'Complete Blood Count (CBC)';
    else if (lowerText.includes('lipid') || lowerText.includes('cholesterol')) reportType = 'Lipid Profile';
    else if (lowerText.includes('liver') || lowerText.includes(' lft') || lowerText.includes('hepatic')) reportType = 'Liver Function Test (LFT)';
    else if (lowerText.includes('kidney') || lowerText.includes(' kft') || lowerText.includes('renal')) reportType = 'Kidney Function Test (KFT)';
    else if (lowerText.includes('thyroid') || lowerText.includes('tsh')) reportType = 'Thyroid Profile';
    else if (lowerText.includes('diabetes') || lowerText.includes('glucose') || lowerText.includes('hba1c')) reportType = 'Blood Glucose / Diabetes Panel';
    else if (lowerText.includes('urine') || lowerText.includes('urinalysis')) reportType = 'Urine Analysis';
    else if (lowerText.includes('blood sugar') || lowerText.includes('fasting')) reportType = 'Blood Sugar Test';

    // Extract date
    const datePatterns = [
        /date\s*:?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
        /date\s*:?\s*(\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2})/i,
        /collected\s*:?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
        /(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4})/i
    ];
    for (const pattern of datePatterns) {
        const match = text.match(pattern);
        if (match) {
            date = match[1];
            break;
        }
    }

    // Extract hospital/clinic name (first few lines often contain it)
    const firstLines = (lines || []).slice(0, 5);
    for (const line of firstLines) {
        const t = line.text || line;
        if (t.length > 5 && t.length < 100 &&
            !/^\d/.test(t) &&
            !/test|result|value|reference/i.test(t)) {
            hospitalName = t;
            break;
        }
    }

    // Extract test results using multiple patterns
    // Pattern 1: "TestName: Value Unit (Reference: X-Y)" or "TestName: Value Unit (Reference: X-Y)"
    const colonPattern = /([A-Za-z][A-Za-z\s\-\(\)\/]+?)\s*[:\|=]\s*(\d+\.?\d*)\s*([a-zA-Z\/µμ%]+(?:\s*\/\s*[a-zA-Zµμ]+)?)\s*(?:\(?\s*(?:Reference|Ref|Range)\s*[:\|]?\s*(\d+\.?\d*\s*[-–]\s*\d+\.?\d*)\s*\))?/gm;

    let match;
    while ((match = colonPattern.exec(text)) !== null) {
        const testName = match[1].trim();
        const value = match[2];
        const unit = match[3] || '';
        const refRange = match[4] || '';

        if (testName.length >= 2 && testName.length <= 50 && !/date|name|patient|doctor|hospital|clinic|sample|collection|collected|report|test name|result|impression|conclusion|finding|observation|comment|note/i.test(testName)) {
            tests.push({
                name: testName,
                value: value,
                unit: unit,
                referenceRange: refRange.replace(/\s/g, ''),
                status: determineStatus(parseFloat(value), refRange),
                confidence: 'high'
            });
        }
    }

    // Pattern 2: "TestName | Value | Unit | Reference" (table format with pipes)
    const pipePattern = /^([A-Za-z][A-Za-z\s\-\(\)\/]+?)\s*[\|]\s*(\d+\.?\d*)\s*[\|]\s*([a-zA-Z\/µμ%]+(?:\s*\/\s*[a-zA-Zµμ]+)?)\s*[\|]?\s*(\d+\.?\d*\s*[-–]\s*\d+\.?\d*)?/gm;
    while ((match = pipePattern.exec(text)) !== null) {
        const testName = match[1].trim();
        const value = match[2];
        const unit = match[3] || '';
        const refRange = match[4] || '';

        const exists = tests.some(t => t.name.toLowerCase() === testName.toLowerCase());
        if (!exists && testName.length >= 2 && testName.length <= 50 && !/date|name|patient|test name|result/i.test(testName)) {
            tests.push({
                name: testName,
                value: value,
                unit: unit,
                referenceRange: refRange.replace(/\s/g, ''),
                status: determineStatus(parseFloat(value), refRange),
                confidence: 'high'
            });
        }
    }

    // Pattern 3: Line-by-line "TestName: Value Unit" without reference
    const simplePattern = /^([A-Za-z][A-Za-z\s\-\(\)\/]+?)\s*[:\|=]\s*(\d+\.?\d*)\s*([a-zA-Z\/µμ%]+(?:\s*\/\s*[a-zA-Zµμ]+)?)/gm;
    while ((match = simplePattern.exec(text)) !== null) {
        const testName = match[1].trim();
        const value = match[2];
        const unit = match[3] || '';

        const exists = tests.some(t => t.name.toLowerCase() === testName.toLowerCase());
        if (!exists && testName.length >= 2 && testName.length <= 50 && !/date|name|patient|doctor|hospital|clinic|sample|collection|report|test name|result|impression|conclusion|finding|observation|comment|note/i.test(testName)) {
            tests.push({
                name: testName,
                value: value,
                unit: unit,
                referenceRange: '',
                status: 'check',
                confidence: 'medium'
            });
        }
    }

    // Extract sections/impressions
    const sectionPatterns = [
        /impression\s*:?\s*(.+?)(?:\n\n|\r\n\r\n|$)/is,
        /conclusion\s*:?\s*(.+?)(?:\n\n|\r\n\r\n|$)/is,
        /finding\s*:?\s*(.+?)(?:\n\n|\r\n\r\n|$)/is,
        /observation\s*:?\s*(.+?)(?:\n\n|\r\n\r\n|$)/is,
        /comment\s*:?\s*(.+?)(?:\n\n|\r\n\r\n|$)/is,
        /note\s*:?\s*(.+?)(?:\n\n|\r\n\r\n|$)/is
    ];

    for (const pattern of sectionPatterns) {
        const match = text.match(pattern);
        if (match) {
            sections.push(match[1].trim().substring(0, 500));
        }
    }

    return {
        reportType,
        date,
        hospitalName,
        tests,
        sections,
        testCount: tests.length,
        extractionConfidence: tests.length > 0 ? 'high' : (text.length > 50 ? 'low' : 'none')
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Determine Test Status from Value and Reference Range
// ─────────────────────────────────────────────────────────────────────────────

function determineStatus(value, refRange) {
    if (!refRange || refRange === '') return 'check';

    // Parse reference range "13.0-17.0" or "13.0 – 17.0"
    const rangeMatch = refRange.match(/(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)/);
    if (!rangeMatch) return 'check';

    const low = parseFloat(rangeMatch[1]);
    const high = parseFloat(rangeMatch[2]);

    if (isNaN(value) || isNaN(low) || isNaN(high)) return 'check';

    if (value < low) return 'low';
    if (value > high) return 'high';
    return 'normal';
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Image Quality Check
// ─────────────────────────────────────────────────────────────────────────────

function checkImageQuality(ocrResult, medicalDetection) {
    const { confidence, text, wordCount, lineCount } = ocrResult;
    const textLength = (text || '').trim().length;

    if (textLength === 0 && wordCount === 0) {
        return {
            quality: 'unreadable',
            message: 'No text could be extracted from this image. The image may be too blurry, too dark, or not contain readable text. Please upload a clearer photo.',
            canProceed: false
        };
    }

    if (confidence < 30 && textLength < 50) {
        return {
            quality: 'poor',
            message: 'The image quality is poor. Some text may be unreadable. I\'ll do my best to extract what I can, but please consider uploading a clearer image for more accurate results.',
            canProceed: true
        };
    }

    if (confidence < 50) {
        return {
            quality: 'fair',
            message: 'The image quality is moderate. I can read some text but some values may be uncertain.',
            canProceed: true
        };
    }

    if (confidence >= 50 && medicalDetection.isMedical) {
        return {
            quality: 'good',
            message: 'Image quality is good. I can read the medical report clearly.',
            canProceed: true
        };
    }

    return {
        quality: 'acceptable',
        message: 'Image processed successfully.',
        canProceed: true
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Main Pipeline: Image → OCR → Structured Data
// ─────────────────────────────────────────────────────────────────────────────

async function processReportImage(imagePath, originalName) {
    const result = {
        success: false,
        ocrText: '',
        ocrConfidence: 0,
        isMedical: false,
        medicalDetection: null,
        quality: null,
        extractedData: null,
        error: null
    };

    try {
        // Step 1: Preprocess image
        let processedPath = imagePath;
        try {
            processedPath = await preprocessImage(imagePath);
        } catch (e) {
            console.warn('Preprocessing failed, using original:', e.message);
            processedPath = imagePath;
        }

        // Step 2: Run OCR
        const ocrResult = await performOCR(processedPath);
        result.ocrText = ocrResult.text;
        result.ocrConfidence = ocrResult.confidence;

        // Clean up preprocessed file if different from original
        if (processedPath !== imagePath && fs.existsSync(processedPath)) {
            try { fs.unlinkSync(processedPath); } catch (e) {}
        }

        // Step 3: Check if image is a medical report
        const medicalDetection = detectMedicalReport(ocrResult.text);
        result.medicalDetection = medicalDetection;
        result.isMedical = medicalDetection.isMedical;

        // Step 4: Check for non-medical images
        const nonMedical = detectNonMedical(ocrResult.text);
        if (nonMedical.isNonMedical && !medicalDetection.isMedical) {
            result.error = 'This does not appear to be a medical report. Please upload a valid medical report image (blood test, lab report, etc.).';
            return result;
        }

        // Step 5: Check image quality
        const quality = checkImageQuality(ocrResult, medicalDetection);
        result.quality = quality;

        if (!quality.canProceed) {
            result.error = quality.message;
            return result;
        }

        // Step 6: Extract structured data
        const extractedData = extractStructuredData(ocrResult.text, ocrResult.lines);
        result.extractedData = extractedData;

        // Step 7: Detect report type from OCR text
        try {
            const reportTypeAnalyzer = require('./report-type-analyzer');
            const reportTypeResult = reportTypeAnalyzer.detectReportType(ocrResult.text);
            result.reportType = reportTypeResult.type !== 'unknown' ? reportTypeResult : null;
            if (result.reportType) {
                result.extractedData.reportType = result.reportType.name || result.extractedData.reportType;
            }
        } catch (e) {
            result.reportType = null;
        }

        // Step 8: Determine final result
        if (extractedData.tests.length > 0) {
            result.success = true;
        } else if (ocrResult.text.length > 20) {
            // We got text but couldn't extract structured data
            // Still return the raw text for analysis
            result.success = true;
            result.extractedData = {
                reportType: 'Medical Report',
                date: '',
                hospitalName: '',
                tests: [],
                sections: [ocrResult.text.substring(0, 1000)],
                testCount: 0,
                extractionConfidence: 'raw_text_only'
            };
        } else {
            result.error = 'Unable to read sufficient text from this image. Please upload a clearer photo of the medical report.';
        }

        return result;
    } catch (error) {
        console.error('OCR pipeline error:', error);
        result.error = 'An error occurred while processing the image: ' + error.message;
        return result;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
    preprocessImage,
    performOCR,
    detectMedicalReport,
    detectNonMedical,
    extractStructuredData,
    checkImageQuality,
    processReportImage,
    determineStatus,
    MEDICAL_KEYWORDS
};
