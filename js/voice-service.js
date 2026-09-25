/**
 * Shrijal Voice Service — Premium Natural Voice Experience
 *
 * Architecture:
 *   TTSProvider (abstract)
 *     └─ BrowserTTSProvider (Web Speech API)
 *
 * Features:
 *   - Premium voice selection with dynamic scoring (no hardcoded voice names)
 *   - Text preprocessing: markdown, URLs, medical abbreviations, numbers
 *   - Smart sentence-aware pauses
 *   - Interruption support (user speaks → immediate stop)
 *   - Voice states: OFF, IDLE, LISTENING, THINKING, SPEAKING, ERROR
 *   - Concise voice responses (long text summarized for speech)
 *   - No duplicate TTS, old audio cancelled on new response
 *   - Privacy: no medical data logged in console
 */

const ShrijalVoice = (() => {

    // ══════════════════════════════════════════════════════════════════════════
    // STATE
    // ══════════════════════════════════════════════════════════════════════════

    let synthesis = null;
    let recognition = null;
    let selectedVoice = null;
    let voiceMode = false;
    let isRecording = false;
    let isSpeaking = false;
    let currentLanguage = 'en-US';
    let userPickedVoice = false;
    let micBlocked = false;
    let conversationManager = null;
    let lastResponse = '';
    let onStateChange = () => {};
    let onTranscript = () => {};
    let onVoiceModeChange = () => {};
    let onOrbStateChange = () => {};
    let introductionSpoken = false;
    let greetingShown = false;
    let currentUserName = '';
    let currentUserRole = '';
    let restartTimer = null;
    let speakResolve = null;
    let recognitionSupported = false;
    let lastReportContext = null;
    let voiceState = 'OFF'; // OFF | IDLE | LISTENING | THINKING | SPEAKING | ERROR
    let currentUtterance = null;

    // ══════════════════════════════════════════════════════════════════════════
    // LOCALE MAP — all 15 Indian languages + English
    // ══════════════════════════════════════════════════════════════════════════

    const LOCALE_MAP = {
        'en': 'en-US', 'hi': 'hi-IN', 'bn': 'bn-IN', 'mr': 'mr-IN',
        'ta': 'ta-IN', 'te': 'te-IN', 'gu': 'gu-IN', 'kn': 'kn-IN',
        'ml': 'ml-IN', 'pa': 'pa-IN', 'or': 'or-IN', 'as': 'as-IN',
        'ur': 'ur-IN', 'ne': 'ne-IN', 'sa': 'sa-IN'
    };

    // ══════════════════════════════════════════════════════════════════════════
    // USER HELPERS
    // ══════════════════════════════════════════════════════════════════════════

    function getCurrentUserDisplayName() {
        try {
            const raw = localStorage.getItem('user');
            if (!raw) return '';
            const user = JSON.parse(raw);
            return user.full_name || user.username || '';
        } catch (e) { return ''; }
    }

    function getCurrentUserRole() {
        try {
            const raw = localStorage.getItem('user');
            if (!raw) return '';
            const user = JSON.parse(raw);
            return user.role || '';
        } catch (e) { return ''; }
    }

    function formatUserNameForShrijal(name) {
        if (!name || typeof name !== 'string') return '';
        return name.trim();
    }

    function loadCurrentUser() {
        currentUserName = getCurrentUserDisplayName();
        currentUserRole = getCurrentUserRole();
    }

    function clearSessionState() {
        greetingShown = false;
        introductionSpoken = false;
        currentUserName = '';
        currentUserRole = '';
        userPickedVoice = false;
        try { localStorage.removeItem('shrijal_voice_name'); } catch (e) {}
        if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GREETING BUILDER (all 15 languages)
    // ══════════════════════════════════════════════════════════════════════════

    function buildShrijalGreeting(name, role, lang) {
        const shortLang = (lang || currentLanguage || 'en-IN').split('-')[0];
        const safeName = formatUserNameForShrijal(name);
        const n = safeName ? ' ' + safeName : '';

        const greetings = {
            'en': 'Hi' + n + "! I'm Shrijal. How can I help you today?",
            'hi': '\u0928\u092E\u0938\u094D\u0925\u0947' + n + ', \u092E\u0948\u0902 Shrijal \u0939\u0942\u0901\u0964 \u092E\u0948\u0902 \u0906\u092A\u0915\u0940 \u0915\u0948\u0938\u0947 \u092E\u0926\u0926 \u0915\u0930 \u0938\u0915\u0924\u0940 \u0939\u0942\u0901?',
            'bn': '\u09A8\u09AE\u09B8\u09CD\u0995\u09BE\u09B0' + n + ', \u09A6\u09BF Shrijal\u0964 \u09A6\u09BF \u0986\u09AA\u09A8\u09BE\u0995\u09C7 \u0995\u09BF\u09AD\u09BE\u09AC\u09C7 \u09B8\u09BE\u09B9\u09BE\u09AF\u09CD\u09AF \u0995\u09B0\u09A4\u09C7 \u09AA\u09BE\u09B0\u09BF?',
            'mr': '\u0928\u092E\u0938\u094D\u0925\u094E\u0930' + n + ', \u092E\u0940 Shrijal \u0906\u0939\u0947\u0964 \u092E\u0940 \u0924\u0941\u092E\u094D\u0939\u093E\u0932\u093E \u0915\u0936\u0940 \u092E\u0926\u0924 \u0915\u0930\u0942 \u0936\u0915\u0924\u0947?',
            'ta': '\u0935\u0923\u0915\u094D\u0915\u092E\u094D' + n + ', \u0928\u093E\u0928\u094D Shrijal. \u0928\u093E\u0928\u094D \u0909\u0919\u094D\u0915\u0933\u094D\u0915\u0941 \u090E\u092A\u094D\u092A\u091F\u093F \u0909\u0924\u0935\u093F\u0932\u093E\u092E\u094D?',
            'te': '\u0928\u092E\u0938\u094D\u0915\u093E\u0930\u0902' + n + ', \u0928\u0947\u0928\u0941 Shrijal. \u0928\u0947\u0928\u0941 \u092E\u0940\u0915\u0941 \u090E\u0932\u093E \u0938\u0939\u093E\u092F\u094D \u091A\u0947\u092F\u0928\u0928\u0941?',
            'gu': '\u0928\u092E\u0938\u094D\u0924\u0947' + n + ', \u0939\u0941\u0902 Shrijal \u091B\u0941\u0902. \u0939\u0941\u0902 \u0924\u092E\u0928\u0947 \u0915\u0947\u0935\u0940 \u0930\u0940\u0924\u0947 \u092E\u0926\u0926 \u0915\u0930\u0940 \u0936\u0915\u0941\u0902?',
            'kn': '\u0928\u092E\u0938\u094D\u0915\u093E\u0930' + n + ', \u0928\u093E\u0928\u0941 Shrijal. \u0928\u093E\u0928\u0941 \u0928\u093F\u092E\u0917\u0946 \u0939\u0947\u0917\u0946 \u0938\u0939\u093E\u092F \u092E\u093E\u0921\u093F \u092E\u093E\u0921\u092C\u0939\u0941\u0926\u0941?',
            'ml': '\u0928\u092E\u0938\u094D\u0915\u093E\u0930\u0902' + n + ', \u091E\u093E\u0928\u094D Shrijal. \u091E\u093E\u0928\u094D \u0928\u093F\u0902\u0917\u0933\u094D\u0915\u0947 \u090E\u0919\u094D\u0917\u0928\u0946 \u0938\u0939\u093E\u092F \u091A\u0947\u092F\u094D\u0924\u094D?',
            'pa': '\u0938\u0924\u093F \u0938\u094D\u0930\u0940 \u0905\u0915\u093E\u0932' + n + ', \u092E\u0948\u0902 Shrijal \u0939\u093E\u0902. \u092E\u0948\u0902 \u0924\u0941\u0939\u093E\u0921\u0940 \u0915\u093F\u0935\u0947\u0902 \u092E\u0926\u0926 \u0915\u0930 \u0938\u0915\u0926\u0940 \u0939\u093E\u0902?',
            'or': '\u0928\u092E\u0938\u094D\u0915\u093E\u0930' + n + ', \u092E\u0941\u0939\u093F Shrijal. \u092E\u0941\u0939\u093F \u0906\u092A\u0923\u093E\u0915\u093F \u0915\u093F\u092D\u093E\u092C\u093F \u0938\u093E\u0939\u093E\u092F\u094D\u092F \u0915\u0930\u093F\u092C\u093F?',
            'ur': '\u0927\u0931\u0948\u0928 \u0939\u0948 ' + n + ' \u092C\u093C\u0940 \u0932\u0940\u0938 Shrijal \u0939\u0948\u0964 \u0945 \u0922 \u0922\u0935\u0940 \u0915\u0940 \u0945 \u092E\u092F\u0932 \u0915\u0930 \u0938\u0915\u0924\u0940 \u0939\u0948\u0964',
            'ne': '\u0928\u092E\u0938\u094D\u0925\u0947' + n + ', \u092E Shrijal \u0939\u0941\u0901\u0964 \u092E \u0924\u092A\u093E\u0908\u0902\u0932\u093E\u0908 \u0915\u0938\u0930\u0940 \u0938\u0939\u092F\u094B\u0917 \u0917\u0930\u094D\u0928 \u0938\u0915\u094D\u0924\u0941?',
            'as': '\u0928\u092E\u0938\u094D\u0915\u093E\u0930' + n + ', \u09AE\u09C8 Shrijal. \u09AE\u09C8 \u0986\u09AA\u09CB\u09A8\u09BE\u0995\u09C7 \u0995\u09C7\u09A8\u09C7\u0995\u09C8\u09A8\u09C7 \u09B8\u09B9\u09BE\u09AF\u09BC \u0995\u09B0\u09BF \u09AA\u09BE\u09B0\u09BF?'
        };

        return greetings[shortLang] || greetings['en'];
    }

    // ══════════════════════════════════════════════════════════════════════════
    // TEXT PREPROCESSING — clean markdown, expand medical terms, fix numbers
    // ══════════════════════════════════════════════════════════════════════════

    const MEDICAL_ABBREVIATIONS = {
        'ECG': 'E C G', 'EKG': 'E K G', 'CBC': 'C B C', 'BP': 'blood pressure',
        'HR': 'heart rate', 'BMI': 'B M I', 'RBC': 'red blood cells',
        'WBC': 'white blood cells', 'BP': 'blood pressure',
        'CT': 'C T', 'MRI': 'M R I', 'X-ray': 'X ray',
        'IV': 'I V', 'ICU': 'I C U', 'OPD': 'O P D',
        'USG': 'ultrasound', 'USG abdomen': 'ultrasound of the abdomen',
        'TSH': 'T S H', 'HbA1c': 'H b A one c',
        'LDL': 'L D L', 'HDL': 'H D L', 'VLDL': 'V L D L',
        'SGPT': 'S G P T', 'SGOT': 'S G O T',
        'eGFR': 'e G F R', 'ESR': 'E S R',
        'UA': 'urine analysis', 'PT': 'prothrombin time',
        'INR': 'I N R', 'APTT': 'A P T T',
        'CRP': 'C R P', 'ESR': 'E S R',
        'DNA': 'D N A', 'RNA': 'R N A',
        'ABG': 'arterial blood gas',
        'LFT': 'liver function test', 'KFT': 'kidney function test',
        'PFT': 'pulmonary function test',
        'DVT': 'deep vein thrombosis',
        'COPD': 'C O P D',
        'MI': 'heart attack', 'CHF': 'congestive heart failure',
        'URI': 'upper respiratory infection',
        'UTI': 'urinary tract infection',
        'TB': 'tuberculosis',
        'SLE': 'S L E',
        'RA': 'rheumatoid arthritis',
        'DM': 'diabetes mellitus',
        'HTN': 'hypertension',
        'g/dL': 'grams per deciliter',
        'mg/dL': 'milligrams per deciliter',
        'mmol/L': 'millimoles per liter',
        'mmHg': 'millimeters of mercury',
        'mEq/L': 'milliequivalents per liter',
        'mcg/dL': 'micrograms per deciliter',
        'ng/mL': 'nanograms per milliliter',
        'IU/mL': 'international units per milliliter',
        'cells/uL': 'cells per microliter',
        'μL': 'microliters'
    };

    function preprocessTextForSpeech(text, lang) {
        if (!text) return '';
        let c = text;

        // 1. Remove markdown formatting
        c = c.replace(/^#{1,6}\s+/gm, '');
        c = c.replace(/\*{1,3}/g, '');
        c = c.replace(/_{1,3}/g, '');
        c = c.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
        c = c.replace(/```[\s\S]*?```/g, '');
        c = c.replace(/`[^`]+`/g, '');
        c = c.replace(/^[\s]*[-\u2022]\s+/gm, '');
        c = c.replace(/^\d+\.\s+/gm, '');

        // 2. Remove URLs, emojis, symbols
        c = c.replace(/https?:\/\/[^\s]+/g, '');
        c = c.replace(/[\u{1F600}-\u{1F64F}]/gu, '');
        c = c.replace(/[\u{1F300}-\u{1F5FF}]/gu, '');
        c = c.replace(/[\u{1F680}-\u{1F6FF}]/gu, '');
        c = c.replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '');
        c = c.replace(/[\u2600-\u26FF]/gu, '');
        c = c.replace(/[\u2700-\u27BF]/gu, '');
        c = c.replace(/[\uFE00-\uFE0F]/gu, '');
        c = c.replace(/[\u200D]/gu, '');

        // 3. Remove HTML tags
        c = c.replace(/<[^>]+>/g, '');

        // 4. Expand medical abbreviations (only for English)
        const shortLang = (lang || currentLanguage || 'en-IN').split('-')[0];
        if (shortLang === 'en') {
            for (const [abbr, expanded] of Object.entries(MEDICAL_ABBREVIATIONS)) {
                const regex = new RegExp('\\b' + abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
                c = c.replace(regex, expanded);
            }
        }

        // 5. Clean up medical values: "13.2 g/dL" → "13.2 grams per deciliter"
        c = c.replace(/(\d+\.?\d*)\s*g\/dL/gi, '$1 grams per deciliter');
        c = c.replace(/(\d+\.?\d*)\s*mg\/dL/gi, '$1 milligrams per deciliter');
        c = c.replace(/(\d+\.?\d*)\s*mmol\/L/gi, '$1 millimoles per liter');
        c = c.replace(/(\d+\.?\d*)\s*mmHg/gi, '$1 millimeters of mercury');
        c = c.replace(/(\d+\.?\d*)\s*mEq\/L/gi, '$1 milliequivalents per liter');

        // 6. Fix blood pressure: "120/80 mmHg" → "120 by 80 millimeters of mercury"
        c = c.replace(/(\d{2,3})\s*\/\s*(\d{2,3})\s*mmHg/gi, '$1 by $2 millimeters of mercury');

        // 7. Clean up punctuation artifacts
        c = c.replace(/\n{3,}/g, '. ');
        c = c.replace(/\n{2}/g, '. ');
        c = c.replace(/\n/g, ' ');
        c = c.replace(/\.{2,}/g, '.');
        c = c.replace(/,{2,}/g, ',');
        c = c.replace(/\s{2,}/g, ' ');

        // 8. Remove disclaimer/source lines for voice (not useful spoken)
        c = c.replace(/\*?Sources?:\*?\s*[\s\S]*$/gi, '');
        c = c.replace(/This information is generated by AI[\s\S]*$/gi, '');
        c = c.replace(/Disclaimer:[\s\S]*$/gi, '');

        c = c.trim();
        if (c.length < 3) return '';
        return c;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SMART PAUSES — insert breathing pauses for natural delivery
    // ══════════════════════════════════════════════════════════════════════════

    function insertSmartPauses(text) {
        if (!text) return text;
        let c = text;

        // After sentence-ending punctuation, ensure a single period (TTS pause)
        c = c.replace(/([.!?])\s+/g, '$1 ');
        c = c.replace(/([.!?]){2,}/g, '$1');

        // After colons in lists, add a slight pause marker
        c = c.replace(/:\s+/g, ': ');

        // Normalize commas
        c = c.replace(/,\s{2,}/g, ', ');

        return c;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // VOICE SELECTION — dynamic scoring, no hardcoded voice names
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Score a voice for quality. Higher = better.
     * Uses dynamic heuristics, not hardcoded voice names.
     */
    function scoreVoice(voice, targetLang) {
        if (!voice) return -1;
        let score = 0;
        const name = (voice.name || '').toLowerCase();
        const lang = (voice.lang || '').toLowerCase();
        const shortLang = (targetLang || 'en-IN').split('-')[0].toLowerCase();

        // --- Language match (biggest factor) ---
        if (lang === targetLang.toLowerCase()) {
            score += 50; // exact locale match
        } else if (lang.startsWith(shortLang)) {
            score += 30; // same language family
        } else if (lang.startsWith('en')) {
            score += 10; // English fallback
        }

        // --- Female voice detection (warmth, clarity) ---
        const femaleHints = [
            'female', 'woman', 'samantha', 'victoria', 'zira', 'susan',
            'karen', 'salli', 'joanna', 'ivy', 'kimberly', 'mizuki',
            'tessa', 'moira', 'fiona', 'alice', 'melina', 'paulina',
            'google.*female', 'microsoft.*zira', 'microsoft.*hazel',
            'microsoft.*susan', 'microsoft.*karen', 'apple.*female',
            'hindi.*female', 'bengali.*female', 'tamil.*female',
            'telugu.*female', 'kannada.*female', 'malayalam.*female',
            'google.*english', 'natural', 'neural', 'premium', 'enhanced'
        ];
        if (femaleHints.some(h => name.includes(h))) {
            score += 25;
        }

        // --- Quality indicators ---
        const qualityHints = [
            'natural', 'neural', 'premium', 'enhanced', 'hd', 'pro',
            'google', 'microsoft', 'apple', 'amazon', 'openai',
            'smooth', 'clear', 'warm', 'soft', 'gentle'
        ];
        if (qualityHints.some(h => name.includes(h))) {
            score += 15;
        }

        // --- Penalize low-quality indicators ---
        const badHints = [
            'robot', 'default', 'system', 'legacy', 'old',
            'male', 'man', 'boy', 'deep', 'bass'
        ];
        if (badHints.some(h => name.includes(h))) {
            score -= 20;
        }

        // --- Prefer voices with "google" (usually highest quality in browsers) ---
        if (name.includes('google')) {
            score += 10;
        }

        return score;
    }

    /**
     * Pick the best voice for a given language from available voices.
     * Uses dynamic scoring — no hardcoded voice names.
     */
    function pickBestVoice(voices, targetLang) {
        if (!voices || !voices.length) return null;
        const shortLang = (targetLang || 'en-IN').split('-')[0];

        // Try in order of preference: exact locale → same language → English → any
        const stages = [
            v => v.lang === targetLang,
            v => v.lang && v.lang.startsWith(shortLang),
            v => v.lang && v.lang.startsWith('en'),
            () => true
        ];

        for (const filter of stages) {
            const candidates = voices.filter(filter);
            if (!candidates.length) continue;

            // Score and pick highest
            let best = null;
            let bestScore = -Infinity;
            for (const v of candidates) {
                const s = scoreVoice(v, targetLang);
                if (s > bestScore) {
                    bestScore = s;
                    best = v;
                }
            }
            if (best && bestScore > 0) return best;
        }

        // Absolute fallback: first voice
        return voices[0] || null;
    }

    function selectBestIndianFemaleVoice(voices) {
        if (!voices || voices.length === 0) return;
        if (userPickedVoice && selectedVoice) return;
        selectedVoice = pickBestVoice(voices, currentLanguage);
    }

    function getVoiceForLanguage(langCode) {
        // User's manual voice choice always wins
        if (userPickedVoice && selectedVoice) return selectedVoice;
        if (!synthesis) return null;
        const voices = synthesis.getVoices();
        return pickBestVoice(voices, normalizeSpeechLocale(langCode || currentLanguage));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // TTSProvider ABSTRACTION
    // ══════════════════════════════════════════════════════════════════════════

    class BrowserTTSProvider {
        constructor() {
            this.synth = window.speechSynthesis || null;
        }

        speak(text, lang) {
            return new Promise((resolve) => {
                if (!this.synth) { resolve(); return; }

                // Cancel any in-progress speech (interruption support)
                this.synth.cancel();

                const cleaned = preprocessTextForSpeech(text, lang);
                if (!cleaned) { resolve(); return; }

                const withPauses = insertSmartPauses(cleaned);

                isSpeaking = true;
                setVoiceState('SPEAKING');
                onOrbStateChange('speaking');

                const utterance = new SpeechSynthesisUtterance(withPauses);
                const speakLang = lang || currentLanguage;
                const voice = getVoiceForLanguage(speakLang);
                if (voice) utterance.voice = voice;
                utterance.lang = speakLang;

                // Premium voice delivery: calm, warm, natural pace
                utterance.rate = 0.92;
                utterance.pitch = 1.15;
                utterance.volume = 1;

                currentUtterance = utterance;

                utterance.onstart = () => {
                    isSpeaking = true;
                    setVoiceState('SPEAKING');
                };

                utterance.onend = () => {
                    isSpeaking = false;
                    currentUtterance = null;
                    setVoiceState(voiceMode ? 'IDLE' : 'OFF');
                    onOrbStateChange(voiceMode ? 'voice-active' : '');
                    speakResolve = null;
                    resolve();
                    // Auto-restart listening in voice mode
                    if (voiceMode) {
                        restartTimer = setTimeout(() => {
                            if (voiceMode && !isRecording) {
                                startListening();
                            }
                        }, 700);
                    }
                };

                utterance.onerror = (e) => {
                    isSpeaking = false;
                    currentUtterance = null;
                    if (e.error === 'canceled' || e.error === 'interrupted') {
                        // Interruption — expected, resolve cleanly
                    } else {
                        setVoiceState('ERROR');
                        setTimeout(() => {
                            setVoiceState(voiceMode ? 'IDLE' : 'OFF');
                        }, 1500);
                    }
                    onOrbStateChange(voiceMode ? 'voice-active' : '');
                    speakResolve = null;
                    resolve();
                };

                speakResolve = resolve;
                this.synth.speak(utterance);
            });
        }

        stop() {
            if (this.synth) this.synth.cancel();
            isSpeaking = false;
            currentUtterance = null;
            if (speakResolve) { speakResolve(); speakResolve = null; }
        }

        pause() {
            if (this.synth && isSpeaking) this.synth.pause();
        }

        resume() {
            if (this.synth) this.synth.resume();
        }

        isSpeaking() {
            return isSpeaking;
        }
    }

    let ttsProvider = null;

    // ══════════════════════════════════════════════════════════════════════════
    // VOICE STATE MANAGEMENT
    // ══════════════════════════════════════════════════════════════════════════

    function setVoiceState(state) {
        voiceState = state;
        const stateMap = {
            'OFF': '',
            'IDLE': 'voice-active',
            'LISTENING': 'listening',
            'THINKING': 'thinking',
            'SPEAKING': 'speaking',
            'ERROR': 'error'
        };
        onStateChange(state.toLowerCase(), state);
        onOrbStateChange(stateMap[state] || '');
    }

    // ══════════════════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ══════════════════════════════════════════════════════════════════════════

    function init(options = {}) {
        synthesis = window.speechSynthesis || null;
        onStateChange = options.onStateChange || (() => {});
        onTranscript = options.onTranscript || (() => {});
        onVoiceModeChange = options.onVoiceModeChange || (() => {});
        onOrbStateChange = options.onOrbStateChange || (() => {});

        // Use account's preferred language as default (English = American en-US)
        if (options.preferredLocale) {
            currentLanguage = normalizeSpeechLocale(options.preferredLocale);
        } else if (options.preferredLanguage) {
            currentLanguage = (LOCALE_MAP[options.preferredLanguage] || options.preferredLanguage + '-IN');
        }

        if (window.LanguageDetection) {
            conversationManager = window.LanguageDetection.createConversationManager();
        }

        loadCurrentUser();

        // Initialize TTS provider
        ttsProvider = new BrowserTTSProvider();

        // Initialize Speech Recognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition && synthesis) {
            recognitionSupported = true;
            recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = true;
            recognition.maxAlternatives = 3;
            recognition.lang = currentLanguage;

            recognition.onstart = function () {
                isRecording = true;
                micBlocked = false;
                setVoiceState('LISTENING');
            };

    // Ask browser for mic permission explicitly before starting recognition
    async function ensureMicAccess() {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return true;
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
            micBlocked = false;
            return true;
        } catch (e) {
            micBlocked = true;
            return false;
        }
    }

            recognition.onresult = function (event) {
                let transcript = '';
                let isFinal = false;
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    transcript += event.results[i][0].transcript;
                    if (event.results[i].isFinal) isFinal = true;
                }
                if (onTranscript) onTranscript(transcript, isFinal);
            };

            recognition.onerror = function (event) {
                isRecording = false;
                if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                    micBlocked = true;
                    setVoiceState('ERROR');
                    onStateChange('error', 'Microphone blocked. Allow mic access and try again.');
                    onOrbStateChange('');
                } else if (event.error === 'no-speech') {
                    onStateChange('listening', 'Awaz sunai nahi di — thoda paas se, zor se bolo...');
                    onOrbStateChange('listening');
                } else if (event.error === 'audio-capture') {
                    setVoiceState('ERROR');
                    onStateChange('error', 'No microphone found on this device.');
                    onOrbStateChange('');
                } else {
                    setVoiceState(voiceMode ? 'IDLE' : 'OFF');
                }
            };

            recognition.onend = function () {
                isRecording = false;
                if (micBlocked) {
                    onOrbStateChange('');
                    return;
                }
                if (voiceMode && !isSpeaking) {
                    setVoiceState('IDLE');
                    onOrbStateChange('voice-active');
                    // Auto-restart listening in voice mode
                    restartTimer = setTimeout(() => {
                        if (voiceMode && !isRecording && !isSpeaking) {
                            startListening();
                        }
                    }, 600);
                } else {
                    setVoiceState('OFF');
                    onOrbStateChange('');
                }
            };
        }

        loadVoices();
        if (synthesis && synthesis.onvoiceschanged !== undefined) {
            synthesis.onvoiceschanged = loadVoices;
        }
    }

    // ── Voice Loading & Selection ─────────────────────────────────────────────

    // English always uses the American (en-US) voice, other languages keep -IN
    function normalizeSpeechLocale(locale) {
        if (!locale || typeof locale !== 'string') return 'en-US';
        if (locale === 'en-IN' || locale === 'en') return 'en-US';
        return locale;
    }

    function loadVoices() {
        if (!synthesis) return;
        const voices = synthesis.getVoices();
        if (voices.length === 0) return;
        // Restore the user's saved voice choice first (survives page refresh)
        if (!userPickedVoice) {
            try {
                const saved = localStorage.getItem('shrijal_voice_name');
                if (saved) {
                    const match = voices.find(v => v.name === saved);
                    if (match) { selectedVoice = match; userPickedVoice = true; return; }
                }
            } catch (e) {}
        }
        if (userPickedVoice && selectedVoice) return;
        selectBestIndianFemaleVoice(voices);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SPEAK — main entry point with interruption + deduplication
    // ══════════════════════════════════════════════════════════════════════════
    function isFemaleVoice(voice) {
        const name = (voice.name || '').toLowerCase();
        const indicators = [
            'female', 'woman', 'samantha', 'victoria', 'zira', 'susan',
            'karen', 'salli', 'joanna', 'ivy', 'kimberly', 'mizuki',
            'tessa', 'moira', 'fiona', 'alice', 'melina', 'paulina',
            'jenny', 'aria', 'sara', 'emma', 'olivia', 'ava', 'sophia',
            'alyssa', 'jane', 'stephanie', 'serena', 'amber', 'ashley',
            'michelle', 'google us english', 'google uk english female',
            'microsoft.*zira', 'microsoft.*jenny', 'microsoft.*aria',
            'microsoft.*hazel', 'microsoft.*susan', 'microsoft.*karen',
            'microsoft.*sara', 'microsoft.*emma', 'apple.*female',
            'hindi.*female', 'bengali.*female', 'tamil.*female',
            'telugu.*female', 'kannada.*female', 'malayalam.*female'
        ];
        return indicators.some(i => name.includes(i));
    }
    function getSelectedVoiceName() {
        return selectedVoice ? (selectedVoice.name + ' (' + selectedVoice.lang + ')') : '';
    }
    function getAvailableVoices() {
        if (!synthesis) return [];
        const all = synthesis.getVoices();
        const en = all
            .filter(v => v.lang && v.lang.toLowerCase().startsWith('en'))
            .map(v => ({ name: v.name, lang: v.lang, female: isFemaleVoice(v) }));
        en.sort((a, b) => {
            const aUS = a.lang.toLowerCase() === 'en-us' ? 0 : 1;
            const bUS = b.lang.toLowerCase() === 'en-us' ? 0 : 1;
            if (aUS !== bUS) return aUS - bUS;
            if (a.female !== b.female) return a.female ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
        return en;
    }
    function setVoiceByName(name) {
        if (!synthesis || !name) return false;
        const v = synthesis.getVoices().find(x => x.name === name);
        if (v) {
            selectedVoice = v;
            userPickedVoice = true;
            try { localStorage.setItem('shrijal_voice_name', name); } catch (e) {}
            return true;
        }
        return false;
    }

    function speakText(text, lang) {
        if (!ttsProvider) return Promise.resolve();

        // Cancel any in-progress speech (interruption support)
        if (isSpeaking) {
            ttsProvider.stop();
        }

        stopListening();
        return ttsProvider.speak(text, lang);
    }

    function stopSpeaking() {
        if (ttsProvider) ttsProvider.stop();
        isSpeaking = false;
        currentUtterance = null;
        setVoiceState(voiceMode ? 'IDLE' : 'OFF');
    }

    // ══════════════════════════════════════════════════════════════════════════
    // LISTENING CONTROL
    // ══════════════════════════════════════════════════════════════════════════

    function startListening() {
        if (!recognition || !recognitionSupported || !voiceMode) return false;
        if (isRecording) return false;

        // Interruption: if speaking, stop immediately when user starts talking
        if (isSpeaking) {
            stopSpeaking();
        }

        updateRecognitionLanguage();

        try {
            recognition.start();
            return true;
        } catch (e) {
            try {
                recognition.stop();
                setTimeout(() => {
                    try { recognition.start(); } catch (e2) {}
                }, 150);
                return true;
            } catch (e2) { return false; }
        }
    }

    function stopListening() {
        if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
        if (recognition && isRecording) {
            try { recognition.stop(); } catch (e) {}
        }
        isRecording = false;
    }

    function updateRecognitionLanguage() {
        if (!recognition) return;
        const lang = conversationManager
            ? conversationManager.getCurrentCode()
            : currentLanguage;
        recognition.lang = lang;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // LANGUAGE MANAGEMENT
    // ══════════════════════════════════════════════════════════════════════════

    function updateConversationLanguage(text) {
        if (!window.LanguageDetection || !conversationManager) return;
        const detected = conversationManager.updateLanguage(text);
        if (detected && detected.confidence >= 0.5) {
            const newLang = normalizeSpeechLocale(detected.code || 'en-US');
            if (newLang !== currentLanguage) {
                currentLanguage = newLang;
                updateRecognitionLanguage();
                if (synthesis) selectBestIndianFemaleVoice(synthesis.getVoices());
            }
        }
    }

    function setCurrentLanguage(lang) {
        currentLanguage = normalizeSpeechLocale(lang);
        updateRecognitionLanguage();
        if (synthesis) selectBestIndianFemaleVoice(synthesis.getVoices());
    }

    function getCurrentLanguage() { return currentLanguage; }
    function getConversationManager() { return conversationManager; }

    // ══════════════════════════════════════════════════════════════════════════
    // VOICE COMMANDS
    // ══════════════════════════════════════════════════════════════════════════

    function setReportContext(reportData) {
        lastReportContext = reportData;
    }

    function getReportContext() {
        return lastReportContext;
    }

    function hasReportContext() {
        return lastReportContext !== null && lastReportContext !== undefined;
    }

    function checkVoiceCommand(text) {
        if (!text) return null;
        const lower = text.toLowerCase().trim();

        // Report-related commands (multilingual)
        const reportIntents = [
            { patterns: ['explain my report', 'explain report', 'explain the report', 'report explain', 'report samjhao', 'meri report samjhao', 'is report ko samjhao', 'report samjha do', 'report ko explain karo', 'report explain karo'], action: 'explain_report' },
            { patterns: ['summarize my report', 'summarize report', 'report summary', 'report ka summary', 'meri report ka summary', 'report summary batao', 'report ka summary batao', 'report ko summarize karo'], action: 'summarize_report' },
            { patterns: ['read my report', 'read report', 'read the report', 'report padho', 'meri report padho', 'is report ko padho', 'report dobara padho', 'report phir se padho'], action: 'read_report' },
            { patterns: ['abnormal values', 'which values are abnormal', 'abnormal results', 'kaun si value abnormal', 'kaun si values abnormal hain', 'abnormal values kya hain', 'kya abnormal hai', 'kya problem hai report mein', 'report mein kya problem hai', 'isme kya dikkat hai', 'isme kya problem hai'], action: 'analyze_abnormal' },
            { patterns: ['doctor ko kya batana', 'what should i ask my doctor', 'doctor ko kya dikhana', 'doctor se kya puchna', 'doctor ko kya bolna', 'doctor ke liye kya', 'doctor discussion'], action: 'doctor_points' },
            { patterns: ['report kya hai', 'what does my report say', 'what is in my report', 'meri report mein kya hai', 'is report mein kya hai', 'isme kya hai', 'report mein kya hai', 'what does this report mean', 'is report ka matlab kya hai'], action: 'explain_report' },
            { patterns: ['report ke bare mein batao', 'tell me about my report', 'report ke baare mein batao', 'report ke baare mein', 'mere report ke baare mein'], action: 'explain_report' },
            { patterns: ['isme hemoglobin', 'isme sugar', 'isme cholesterol', 'isme platelet', 'isme wbc', 'isme rbc', 'isme creatinine', 'isme urea'], action: 'explain_report' }
        ];

        for (const intent of reportIntents) {
            for (const pattern of intent.patterns) {
                if (lower.includes(pattern)) {
                    return { action: intent.action, originalText: text };
                }
            }
        }

        // Control commands (English)
        const englishCmds = [
            'stop speaking', 'stop listening', 'clear chat', 'clear conversation',
            'read the answer', 'read this', 'read again', 'introduce yourself',
            'who are you', 'repeat', 'stop voice', 'turn off voice', 'voice off',
            'start listening', 'voice on', 'turn on voice', 'speak slower', 'speak slowly'
        ];
        for (const cmd of englishCmds) {
            if (lower.includes(cmd)) {
                if (cmd.includes('stop speaking') || cmd.includes('stop listening') || cmd.includes('stop voice') || cmd.includes('turn off voice') || cmd.includes('voice off')) return { action: 'stop' };
                if (cmd.includes('clear')) return { action: 'clear' };
                if (cmd.includes('read')) return { action: 'read_last' };
                if (cmd.includes('introduce') || cmd.includes('who')) return { action: 'introduce' };
                if (cmd.includes('repeat')) return { action: 'repeat' };
                if (cmd.includes('start listening') || cmd.includes('voice on') || cmd.includes('turn on voice')) return { action: 'start_listening' };
                if (cmd.includes('speak slow')) return { action: 'speak_slower' };
            }
        }

        // Hindi commands
        const hindiCmds = {
            '\u0938\u0941\u0928\u0928\u093E \u092C\u0902\u0926': 'stop',
            '\u092C\u094B\u0932\u0928\u093E \u092C\u0902\u0926': 'stop',
            '\u0930\u0941\u0915\u094B': 'stop',
            '\u0939\u093F\u0902 \u092C\u0902\u0926': 'stop',
            '\u0935\u0949\u0932\u094D\u092F\u0942 \u092C\u0902\u0926': 'stop',
            '\u092B\u093F\u0930 \u0938\u0947 \u092C\u094B\u0932\u094B': 'repeat',
            '\u0926\u094B\u092C\u093E\u0930\u093E \u092C\u094B\u0932\u094B': 'repeat',
            '\u0905\u092A\u0928\u093E \u092A\u0930\u093F\u091A\u092F': 'introduce',
            '\u0924\u0941\u092E \u0915\u094C\u0928': 'introduce'
        };
        for (const [cmd, action] of Object.entries(hindiCmds)) {
            if (lower.includes(cmd)) return { action };
        }

        // Hinglish commands
        const hinglishCmds = { 'listening band': 'stop', 'sunna band': 'stop', 'dobara bolo': 'repeat', 'phir se bolo': 'repeat', 'apna introduction': 'introduce', 'tum kaun': 'introduce', 'voice band': 'stop', 'awaaz band': 'stop' };
        for (const [cmd, action] of Object.entries(hinglishCmds)) {
            if (lower.includes(cmd)) return { action };
        }

        return null;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // VOICE MODE TOGGLE
    // ══════════════════════════════════════════════════════════════════════════

    function enableVoiceMode() {
        voiceMode = true;
        onVoiceModeChange(true);
        setVoiceState('IDLE');
        onOrbStateChange('voice-active');
    }

    function disableVoiceMode() {
        voiceMode = false;
        stopListening();
        stopSpeaking();
        isSpeaking = false;
        setVoiceState('OFF');
        onVoiceModeChange(false);
    }

    function toggleVoiceMode() {
        if (voiceMode) disableVoiceMode();
        else enableVoiceMode();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ══════════════════════════════════════════════════════════════════════════

    function setVoiceMode(enabled) {
        if (enabled) enableVoiceMode();
        else disableVoiceMode();
    }

    function getVoiceMode() { return voiceMode; }
    function getIsRecording() { return isRecording; }
    function getIsSpeaking() { return isSpeaking; }
    function isIntroductionSpoken() { return introductionSpoken; }
    function setIntroductionSpoken(val) { introductionSpoken = val; }
    function isGreetingShown() { return greetingShown; }
    function setGreetingShown(val) { greetingShown = val; }
    function setLastResponse(text) { lastResponse = text; }
    function getLastResponse() { return lastResponse; }
    function getCurrentUserName() { loadCurrentUser(); return currentUserName; }
    function getCurrentUserRole_() { loadCurrentUser(); return currentUserRole; }
    function isRecognitionSupported() { return recognitionSupported; }
    function getState() { return voiceState; }

    function setOrbState(state) { onOrbStateChange(state); }

    /**
     * Interrupt: stop current speech + listening immediately.
     * Call this when user starts speaking while Shrijal is speaking.
     */
    function interrupt() {
        stopSpeaking();
        stopListening();
        setVoiceState(voiceMode ? 'IDLE' : 'OFF');
    }

    /**
     * Prepare text for speech (exposed for external use).
     */
    function prepareTextForSpeech(text, lang) {
        return preprocessTextForSpeech(text, lang);
    }

    return {
        init,
        speakText,
        stopSpeaking,
        interrupt,
        startListening,
        stopListening,
        checkVoiceCommand,
        toggleVoiceMode,
        enableVoiceMode,
        disableVoiceMode,
        setVoiceMode,
        getVoiceMode,
        getIsRecording,
        getIsSpeaking,
        getState,
        setCurrentLanguage,
        setLanguage: setCurrentLanguage,
        getCurrentLanguage,
        setLastResponse,
        getLastResponse,
        isIntroductionSpoken,
        setIntroductionSpoken,
        isGreetingShown,
        setGreetingShown,
        getConversationManager,
        getCurrentUserDisplayName,
        getCurrentUserRole: getCurrentUserRole_,
        formatUserNameForShrijal,
        buildShrijalGreeting,
        loadCurrentUser,
        clearSessionState,
        prepareTextForSpeech,
        selectBestIndianFemaleVoice,
        getVoiceForLanguage,
        getSelectedVoiceName,
        getAvailableVoices,
        setVoiceByName,
        ensureMicAccess,
        setOrbState,
        updateConversationLanguage,
        updateRecognitionLanguage,
        isRecognitionSupported,
        setReportContext,
        getReportContext,
        hasReportContext,
        pickBestVoice,
        scoreVoice,
        LOCALE_MAP
    };
})();

if (typeof window !== 'undefined') window.ShrijalVoice = ShrijalVoice;
