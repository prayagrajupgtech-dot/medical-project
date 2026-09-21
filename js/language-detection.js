/**
 * Language Detection Module for Shrijal
 * Detects Indian languages, Hinglish, and English from user input.
 * No external API needed — uses Unicode range analysis + keyword patterns.
 */

const LanguageDetection = (() => {

    // ── Language Definitions ──────────────────────────────────────────────────

    const LANGUAGES = {
        'hi': { name: 'Hindi', code: 'hi-IN', script: 'Devanagari', confidence: 0 },
        'bn': { name: 'Bengali', code: 'bn-IN', script: 'Bengali', confidence: 0 },
        'mr': { name: 'Marathi', code: 'mr-IN', script: 'Devanagari', confidence: 0 },
        'ta': { name: 'Tamil', code: 'ta-IN', script: 'Tamil', confidence: 0 },
        'te': { name: 'Telugu', code: 'te-IN', script: 'Telugu', confidence: 0 },
        'gu': { name: 'Gujarati', code: 'gu-IN', script: 'Gujarati', confidence: 0 },
        'kn': { name: 'Kannada', code: 'kn-IN', script: 'Kannada', confidence: 0 },
        'ml': { name: 'Malayalam', code: 'ml-IN', script: 'Malayalam', confidence: 0 },
        'pa': { name: 'Punjabi', code: 'pa-IN', script: 'Gurmukhi', confidence: 0 },
        'or': { name: 'Odia', code: 'or-IN', script: 'Odia', confidence: 0 },
        'as': { name: 'Assamese', code: 'as-IN', script: 'Bengali', confidence: 0 },
        'ur': { name: 'Urdu', code: 'ur-IN', script: 'Arabic', confidence: 0 },
        'ne': { name: 'Nepali', code: 'ne-IN', script: 'Devanagari', confidence: 0 },
        'sa': { name: 'Sanskrit', code: 'sa-IN', script: 'Devanagari', confidence: 0 },
        'en': { name: 'English', code: 'en-IN', script: 'Latin', confidence: 0 }
    };

    // ── Unicode Script Ranges ─────────────────────────────────────────────────

    const SCRIPT_RANGES = {
        'Devanagari': /[\u0900-\u097F]/g,     // Hindi, Marathi, Nepali, Sanskrit
        'Bengali': /[\u0980-\u09FF]/g,        // Bengali, Assamese
        'Tamil': /[\u0B80-\u0BFF]/g,          // Tamil
        'Telugu': /[\u0C00-\u0C7F]/g,         // Telugu
        'Gujarati': /[\u0A80-\u0AFF]/g,       // Gujarati
        'Kannada': /[\u0C80-\u0CFF]/g,        // Kannada
        'Malayalam': /[\u0D00-\u0D7F]/g,      // Malayalam
        'Gurmukhi': /[\u0A00-\u0A7F]/g,       // Punjabi
        'Odia': /[\u0B00-\u0B7F]/g,           // Odia
        'Arabic': /[\u0600-\u06FF\u0750-\u077F]/g, // Urdu (Arabic script)
        'Latin': /[a-zA-Z]/g
    };

    // ── Hindi / Devanagari Keywords ───────────────────────────────────────────

    const HINDI_KEYWORDS = [
        'मुझे', 'मेरा', 'मेरी', 'में', 'है', 'हैं', 'हो', 'क्या', 'कैसे', 'क्यों',
        'कब', 'कहाँ', 'कौन', 'यह', 'वह', 'इस', 'उस', 'और', 'या', 'पर', 'से',
        'को', 'की', 'के', 'ने', 'था', 'थी', 'थे', 'होगा', 'होगी', 'होंगे',
        'कर', 'करना', 'करते', 'किया', 'जाओ', 'आओ', 'बताओ', 'समझ', 'दिखा',
        'दर्द', 'बुखार', 'सिर', 'पेट', 'सीने', 'साँस', 'खाँसी', 'उल्टी', 'दस्त',
        'चक्कर', 'कमज़ोरी', 'थकान', 'पीठ', 'जोड़', 'त्वचा', 'खुजली', 'सूजन',
        'नींद', 'तनाव', 'चिंता', 'डॉक्टर', 'अस्पताल', 'दवा', 'इलाज', 'रिपोर्ट',
        'खून', 'पेशाब', 'वजन', 'ब्लड', 'प्रेशर', 'शुगर', 'थायरॉइड', 'हीमोग्लोबिन',
        'हैलो', 'नमस्ते', 'जी', 'बिल्कुल', 'ठीक', 'अच्छा', 'बताइए', 'सुनिए',
        'करो', 'बोलो', 'बता', 'दो', 'लो', 'जा', 'आ', 'खा', 'पी', 'सो',
        'मत', 'नहीं', 'हाँ', 'ना', 'भी', 'तो', 'ही', 'अब', 'फिर', 'अभी',
        'कल', 'आज', 'कल', 'सुबह', 'शाम', 'रात', 'दिन', 'हफ्ते', 'महीने',
        'डॉक्टर', 'दिखाना', 'दिखाने', 'जाना', 'चाहिए', 'सकते', 'होता', 'होती'
    ];

    // ── Hinglish Patterns ─────────────────────────────────────────────────────

    const HINGLISH_PATTERNS = [
        /\b(mujhe|mera|meri|hum|hai|hain|ho|kya|kaise|kyon|kab|kahan|yah|woh|ise|usse|aur|ya|par|se|ko|ki|ke|ne|tha|thi|the|hoga|hogi|kar|karna|karte|kiya|jao|aao|batao|samjho|dekho)\b/i,
        /\b(dard|bukhar|sir|pet|saans|khaansi|ulti|dast|chakkar|kamzori|thakan|peeth|jod|twacha|khujli|sojan|neend|tension|chinta|doctor|aspatal|dawa|ilaj|report|khoon|wajan|blood|pressure|sugar|thyroid|hemoglobin)\b/i,
        /\b(hello|namaste|ji|bilkul|theek|achha|bataiye|suniye|karo|bolo|bata|do|lo|jao|aa|kha|pi|so|mat|nahi|haan|na|bhi|to|hi|ab|phir|abhi|kal|aaj|subah|shaam|raat|din|hafte|mahine)\b/i,
        /\b(kab dikhana|kaise hai|kya hai|kya hota|kya karu|kya khana|kya avoid|kya nahi|meri report|mera report|samjhao|dikhao|batao)\b/i
    ];

    // ── Marathi Keywords ──────────────────────────────────────────────────────

    const MARATHI_KEYWORDS = [
        'मला', 'माझा', 'माझी', 'आहे', 'आहेत', 'काय', 'कसे', 'का', 'केव्हा', 'कुठे',
        'दुखते', 'ताप', 'डोके', 'पोट', 'श्वास', 'खोकला', 'मळ', 'सर्दी', 'थकवा',
        'डॉक्टर', 'औषध', 'उपचार', 'तपासणी', 'नमस्कार', 'स्वतः'
    ];

    // ── Bengali Keywords ──────────────────────────────────────────────────────

    const BENGALI_KEYWORDS = [
        'আমাকে', 'আমার', 'আছে', 'কি', 'কীভাবে', 'কেন', 'কখন', 'কোথায়',
        'ব্যথা', 'জ্বর', 'মাথা', 'পেট', 'শ্বাস', 'কাশি', 'বমি', 'পাতলা',
        'ডাক্তার', 'ওষুধ', 'চিকিৎসা', 'রিপোর্ট', 'নমস্কার'
    ];

    // ── Tamil Keywords ────────────────────────────────────────────────────────

    const TAMIL_KEYWORDS = [
        'எனக்கு', 'என்', 'இருக்கிறது', 'என்ன', 'எப்படி', 'ஏன்', 'எப்போது', 'எங்கே',
        'வலி', 'காய்ச்சல்', 'தலைவலி', 'வயிறு', 'சுவாசம்', 'இருமல்', 'வாந்தி',
        'மருத்துவர்', 'மருந்து', 'சிகிச்சை', 'அறிக்கை', 'வணக்கம்'
    ];

    // ── Telugu Keywords ───────────────────────────────────────────────────────

    const TELUGU_KEYWORDS = [
        'నాకు', 'నా', 'ఉంది', 'ఏమిటి', '�లా', 'ఎందుకు', 'ఎప్పుడు', 'ఎక్కడ',
        'నొప్పి', 'జ్వరం', 'తల', 'కడుపు', 'శ్వాస', 'దగ్గు', '�ాంతి',
        'వైద్యుడు', 'మందు', 'చికిత్స', 'నమస్కారం'
    ];

    // ── Gujarati Keywords ─────────────────────────────────────────────────────

    const GUJARATI_KEYWORDS = [
        'મને', 'મારા', 'મારી', 'છે', 'શું', 'કેવી રીતે', 'શા માટે', 'ક્યારે',
        'દુખાવો', 'તાવ', 'માથું', 'પેટ', 'શ્વાસ', 'ખાંસી', 'ઉલ્ટી',
        'ડૉક્ટર', 'દવા', 'સારવાર', 'નમસ્તે'
    ];

    // ── Kannada Keywords ──────────────────────────────────────────────────────

    const KANNADA_KEYWORDS = [
        'ನನಗೆ', 'ನನ್ನ', 'ಇದೆ', 'ಏನು', 'ಹೇಗೆ', 'ಯಾಕೆ', 'ಯಾವಾಗ', 'ಎಲ್ಲಿ',
        'ನೋವು', 'ಜ್ವರ', 'ತಲೆ', 'ಹೊಟ್ಟೆ', 'ಉಸಿರು', 'ಕೆಮ್ಮು', 'ವಾಂತಿ',
        'ವೈದ್ಯ', 'ಔಷಧ', 'ಚಿಕಿತ್ಸೆ', 'ನಮಸ್ಕಾರ'
    ];

    // ── Malayalam Keywords ────────────────────────────────────────────────────

    const MALAYALAM_KEYWORDS = [
        'എനിക്ക്', 'എന്റെ', 'ഉണ്ട്', 'എന്താണ്', 'എങ്ങനെ', 'എന്തുകൊണ്ട്', 'എപ്പോൾ',
        'വേദന', 'പനി', 'തലവേദന', 'വയറ്', 'ശ്വാസം', 'ചുമ', '�ർദ്ദി',
        'ഡോക്ടർ', 'മരുന്ന്', 'ചികിത്സ', 'നമസ്കാരം'
    ];

    // ── Punjabi Keywords ──────────────────────────────────────────────────────

    const PUNJABI_KEYWORDS = [
        'ਮੈਨੂੰ', 'ਮੇਰਾ', 'ਮੇਰੀ', 'ਹੈ', 'ਕੀ', 'ਕਿਵੇਂ', 'ਕਿਉਂ', 'ਕਦੋਂ',
        'ਦਰਦ', 'ਬੁਖ਼ਾਰ', 'ਸਿਰ', 'ਪੇਟ', 'ਸਾਹ', 'ਖੰਘ', 'ਉਲਟੀ',
        'ਡਾਕਟਰ', 'ਦਵਾਈ', 'ਇਲਾਜ', 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ'
    ];

    // ── Core Detection Function ───────────────────────────────────────────────

    function detectLanguage(text) {
        if (!text || typeof text !== 'string') {
            return { language: 'en', code: 'en-IN', confidence: 0, isHinglish: false };
        }

        const trimmed = text.trim();
        if (trimmed.length === 0) {
            return { language: 'en', code: 'en-IN', confidence: 0, isHinglish: false };
        }

        // Count characters by script
        const scriptCounts = {};
        let totalChars = 0;

        for (const [script, pattern] of Object.entries(SCRIPT_RANGES)) {
            const matches = trimmed.match(pattern);
            if (matches) {
                scriptCounts[script] = matches.length;
                totalChars += matches.length;
            }
        }

        if (totalChars === 0) {
            return { language: 'en', code: 'en-IN', confidence: 0.5, isHinglish: false };
        }

        // Find dominant script
        let dominantScript = 'Latin';
        let maxCount = 0;
        for (const [script, count] of Object.entries(scriptCounts)) {
            if (count > maxCount) {
                maxCount = count;
                dominantScript = script;
            }
        }

        const latinCount = scriptCounts['Latin'] || 0;
        const devanagariCount = scriptCounts['Devanagari'] || 0;
        const bengaliCount = scriptCounts['Bengali'] || 0;
        const tamilCount = scriptCounts['Tamil'] || 0;
        const teluguCount = scriptCounts['Telugu'] || 0;
        const gujaratiCount = scriptCounts['Gujarati'] || 0;
        const kannadaCount = scriptCounts['Kannada'] || 0;
        const malayalamCount = scriptCounts['Malayalam'] || 0;
        const gurmukhiCount = scriptCounts['Gurmukhi'] || 0;
        const odiaCount = scriptCounts['Odia'] || 0;
        const arabicCount = scriptCounts['Arabic'] || 0;

        // Check for Hinglish (Latin + Devanagari mixed)
        const isHinglish = (latinCount > 0 && devanagariCount > 0) ||
            (latinCount > 0 && HINGLISH_PATTERNS.some(p => p.test(trimmed)));

        if (isHinglish && latinCount > devanagariCount * 0.3) {
            return {
                language: 'hi',
                code: 'hi-IN',
                confidence: 0.8,
                isHinglish: true,
                script: 'mixed'
            };
        }

        // Pure script detection
        if (devanagariCount > latinCount && devanagariCount > 0) {
            // Check for specific Devanagari languages
            const lower = trimmed.toLowerCase();
            if (MARATHI_KEYWORDS.some(k => lower.includes(k.toLowerCase()))) {
                return { language: 'mr', code: 'mr-IN', confidence: 0.85, isHinglish: false };
            }
            if (HINDI_KEYWORDS.some(k => lower.includes(k.toLowerCase()))) {
                return { language: 'hi', code: 'hi-IN', confidence: 0.9, isHinglish: false };
            }
            return { language: 'hi', code: 'hi-IN', confidence: 0.7, isHinglish: false };
        }

        if (bengaliCount > 0) {
            return { language: 'bn', code: 'bn-IN', confidence: 0.85, isHinglish: false };
        }
        if (tamilCount > 0) {
            return { language: 'ta', code: 'ta-IN', confidence: 0.85, isHinglish: false };
        }
        if (teluguCount > 0) {
            return { language: 'te', code: 'te-IN', confidence: 0.85, isHinglish: false };
        }
        if (gujaratiCount > 0) {
            return { language: 'gu', code: 'gu-IN', confidence: 0.85, isHinglish: false };
        }
        if (kannadaCount > 0) {
            return { language: 'kn', code: 'kn-IN', confidence: 0.85, isHinglish: false };
        }
        if (malayalamCount > 0) {
            return { language: 'ml', code: 'ml-IN', confidence: 0.85, isHinglish: false };
        }
        if (gurmukhiCount > 0) {
            return { language: 'pa', code: 'pa-IN', confidence: 0.85, isHinglish: false };
        }
        if (odiaCount > 0) {
            return { language: 'or', code: 'or-IN', confidence: 0.85, isHinglish: false };
        }
        if (arabicCount > 0) {
            return { language: 'ur', code: 'ur-IN', confidence: 0.8, isHinglish: false };
        }

        // Latin script — check if it's Hinglish via keyword patterns
        if (latinCount > 0) {
            const lower = trimmed.toLowerCase();
            if (HINGLISH_PATTERNS.some(p => p.test(trimmed))) {
                return { language: 'hi', code: 'hi-IN', confidence: 0.7, isHinglish: true };
            }
            return { language: 'en', code: 'en-IN', confidence: 0.6, isHinglish: false };
        }

        return { language: 'en', code: 'en-IN', confidence: 0.3, isHinglish: false };
    }

    // ── Conversation Language Manager ─────────────────────────────────────────

    function createConversationManager() {
        let currentLanguage = 'en';
        let currentCode = 'en-IN';
        let confidence = 0;
        let isHinglish = false;
        const history = [];

        function updateLanguage(text) {
            const detected = detectLanguage(text);

            // Only switch if confidence is high enough
            if (detected.confidence >= 0.65) {
                currentLanguage = detected.language;
                currentCode = detected.code;
                confidence = detected.confidence;
                isHinglish = detected.isHinglish;
            }

            history.push({
                text: text.substring(0, 100),
                detected: detected.language,
                confidence: detected.confidence,
                timestamp: Date.now()
            });

            return detected;
        }

        function getCurrentLanguage() {
            return currentLanguage;
        }

        function getCurrentCode() {
            return currentCode;
        }

        function getIsHinglish() {
            return isHinglish;
        }

        function getConfidence() {
            return confidence;
        }

        function getHistory() {
            return [...history];
        }

        return {
            updateLanguage,
            getCurrentLanguage,
            getCurrentCode,
            getIsHinglish,
            getConfidence,
            getHistory
        };
    }

    // ── Short Introduction by Language ────────────────────────────────────────

    const INTRODUCTIONS = {
        'en': "Hi, I'm Shrijal. How can I help you today?",
        'hi': "नमस्ते, मैं Shrijal हूँ। मैं आपकी कैसे मदद कर सकती हूँ?",
        'hinglish': "Hi, main Shrijal hoon. Main aapki kaise help kar sakti hoon?",
        'bn': "নমস্কার, আমি Shrijal। আমি আপনাকে কিভাবে সাহায্য করতে পারি?",
        'mr': "नमस्कार, मी Shrijal आहे। मी तुम्हाला कशी मदत करू शकते?",
        'ta': "வணக்கம், நான் Shrijal. நான் உங்களுக்கு எப்படி உதவலாம்?",
        'te': "నమస్కారం, నేను Shrijal. నేను మీకు ఎలా సహాయం చేయగలను?",
        'gu': "નમસ્તે, હું Shrijal છું. હું તમને કેવી રીતે મદદ કરી શકું?",
        'kn': "ನಮಸ್ಕಾರ, ನಾನು Shrijal. ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?",
        'ml': "നമസ്കാരം, ഞാൻ Shrijal. ഞാൻ നിങ്ങളെ എങ്ങനെ സഹായിക്കാം?",
        'pa': "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ, ਮੈਂ Shrijal ਹਾਂ। ਮੈਂ ਤੁਹਾਡੀ ਕਿਵੇਂ ਮਦਦ ਕਰ ਸਕਦੀ ਹਾਂ?",
        'or': "ନମସ୍କାର, ମୁଁ Shrijal। ମୁଁ ଆପଣଙ୍କୁ କିପରି ସାହାଯ୍ୟ କରିପାରିବି?",
        'ur': "السلام علیکم، میں Shrijal ہوں۔ میں آپ کی کیسے مدد کر سکتی ہوں؟",
        'ne': "नमस्ते, म Shrijal हुँ। म तपाईंलाई कसरी सहयोग गर्न सक्छु?",
        'as': "নমস্কাৰ, মই Shrijal। মই আপোনাক কেনেকৈ সহায় কৰিব পাৰোঁ?"
    };

    function getIntroduction(languageCode) {
        const lang = languageCode.split('-')[0];
        return INTRODUCTIONS[lang] || INTRODUCTIONS['en'];
    }

    // ── Public API ────────────────────────────────────────────────────────────

    return {
        detectLanguage,
        createConversationManager,
        getIntroduction,
        LANGUAGES,
        SCRIPT_RANGES
    };

})();

// Make available globally
if (typeof window !== 'undefined') {
    window.LanguageDetection = LanguageDetection;
}
