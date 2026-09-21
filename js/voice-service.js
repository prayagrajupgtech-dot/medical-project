/**
 * Shrijal Voice Service — Complete TTS + STT + Language Pipeline
 * Handles: language detection, voice selection, text cleaning, natural speech,
 * personalized greetings, auto-restart listening, voice state visualization.
 */

const ShrijalVoice = (() => {

    // ── State ─────────────────────────────────────────────────────────────────

    let synthesis = null;
    let recognition = null;
    let selectedVoice = null;
    let voiceMode = false;
    let isRecording = false;
    let isSpeaking = false;
    let currentLanguage = 'en-IN';
    let conversationManager = null;
    let lastResponse = '';
    let onStateChange = null;
    let onTranscript = null;
    let onVoiceModeChange = null;
    let onOrbStateChange = null;
    let introductionSpoken = false;
    let greetingShown = false;
    let currentUserName = '';
    let currentUserRole = '';
    let restartTimer = null;
    let speakResolve = null;
    let recognitionSupported = false;
    let lastReportContext = null;

    // ── User Name Helpers ─────────────────────────────────────────────────────

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

    // ── Greeting Builder ──────────────────────────────────────────────────────

    function buildShrijalGreeting(name, role, lang) {
        const shortLang = (lang || currentLanguage || 'en-IN').split('-')[0];
        const safeName = formatUserNameForShrijal(name);
        const namePart = safeName ? safeName : '';

        const greetings = {
            'en': 'Hi' + (namePart ? ' ' + namePart : '') + "! I'm Shrijal. How can I help you today?",
            'hi': '\u0928\u092E\u0938\u094D\u0925\u0947' + (namePart ? ' ' + namePart : '') + ', \u092E\u0948\u0902 Shrijal \u0939\u0942\u0901\u0964 \u092E\u0948\u0902 \u0906\u092A\u0915\u0940 \u0915\u0948\u0938\u0947 \u092E\u0926\u0926 \u0915\u0930 \u0938\u0915\u0924\u0940 \u0939\u0942\u0901?',
            'bn': '\u09A8\u09AE\u09B8\u09CD\u0995\u09BE\u09B0' + (namePart ? ' ' + namePart : '') + ', \u09A6\u09BF Shrijal\u0964 \u09A6\u09BF \u0986\u09AA\u09A8\u09BE\u0995\u09C7 \u0995\u09BF\u09AD\u09BE\u09AC\u09C7 \u09B8\u09BE\u09B9\u09BE\u09AF\u09CD\u09AF \u0995\u09B0\u09A4\u09C7 \u09AA\u09BE\u09B0\u09BF?',
            'mr': '\u0928\u092E\u0938\u094D\u0925\u094E\u0930' + (namePart ? ' ' + namePart : '') + ', \u092E\u0940 Shrijal \u0906\u0939\u0947\u0964 \u092E\u0940 \u0924\u0941\u092E\u094D\u0939\u093E\u0932\u093E \u0915\u0936\u0940 \u092E\u0926\u0924 \u0915\u0930\u0942 \u0936\u0915\u0924\u0947?',
            'ta': '\u0935\u0923\u0915\u094D\u0915\u092E\u094D' + (namePart ? ' ' + namePart : '') + ', \u0928\u093E\u0928\u094D Shrijal. \u0928\u093E\u0928\u094D \u0909\u0919\u094D\u0915\u0933\u094D\u0915\u0941 \u090E\u092A\u094D\u092A\u091F\u093F \u0909\u0924\u0935\u093F\u0932\u093E\u092E\u094D?',
            'te': '\u0928\u092E\u0938\u094D\u0915\u093E\u0930\u0902' + (namePart ? ' ' + namePart : '') + ', \u0928\u0947\u0928\u0941 Shrijal. \u0928\u0947\u0928\u0941 \u092E\u0940\u0915\u0941 \u090E\u0932\u093E \u0938\u0939\u093E\u092F\u094D \u091A\u0947\u092F\u0928\u0928\u0941?',
            'gu': '\u0928\u092E\u0938\u094D\u0924\u0947' + (namePart ? ' ' + namePart : '') + ', \u0939\u0941\u0902 Shrijal \u091B\u0941\u0902. \u0939\u0941\u0902 \u0924\u092E\u0928\u0947 \u0915\u0947\u0935\u0940 \u0930\u0940\u0924\u0947 \u092E\u0926\u0926 \u0915\u0930\u0940 \u0936\u0915\u0941\u0902?',
            'kn': '\u0928\u092E\u0938\u094D\u0915\u093E\u0930' + (namePart ? ' ' + namePart : '') + ', \u0928\u093E\u0928\u0941 Shrijal. \u0928\u093E\u0928\u0941 \u0928\u093F\u092E\u0917\u0946 \u0939\u0947\u0917\u0946 \u0938\u0939\u093E\u092F \u092E\u093E\u0921\u093F \u092E\u093E\u0921\u092C\u0939\u0941\u0926\u0941?',
            'ml': '\u0928\u092E\u0938\u094D\u0915\u093E\u0930\u0902' + (namePart ? ' ' + namePart : '') + ', \u091E\u093E\u0928\u094D Shrijal. \u091E\u093E\u0928\u094D \u0928\u093F\u0902\u0917\u0933\u094D\u0915\u0947 \u090E\u0919\u094D\u0917\u0928\u0946 \u0938\u0939\u093E\u092F \u091A\u0947\u092F\u094D\u0924\u094D?',
            'pa': '\u0938\u0924\u093F \u0938\u094D\u0930\u0940 \u0905\u0915\u093E\u0932' + (namePart ? ' ' + namePart : '') + ', \u092E\u0948\u0902 Shrijal \u0939\u093E\u0902. \u092E\u0948\u0902 \u0924\u0941\u0939\u093E\u0921\u0940 \u0915\u093F\u0935\u0947\u0902 \u092E\u0926\u0926 \u0915\u0930 \u0938\u0915\u0926\u0940 \u0939\u093E\u0902?',
            'or': '\u0928\u092E\u0938\u094D\u0915\u093E\u0930' + (namePart ? ' ' + namePart : '') + ', \u092E\u0941\u0939\u093F Shrijal. \u092E\u0941\u0939\u093F \u0906\u092A\u0923\u093E\u0915\u093F \u0915\u093F\u092D\u093E\u092C\u093F \u0938\u093E\u0939\u093E\u092F\u094D\u092F \u0915\u0930\u093F\u092C\u093F?',
            'ur': '\u0927\u0931\u0948\u0928 \u0939\u0948 ' + (namePart ? namePart + ' ' : '') + '\u092C\u093C\u0940 \u0934\u0940\u0938 Shrijal \u0939\u0948\u0964 \u0945 \u0922 \u0922\u0935\u0940 \u0915\u0940 \u0945 \u092E\u092F\u0932 \u0915\u0930 \u0938\u0915\u0924\u0940 \u0939\u0948\u0964',
            'ne': '\u0928\u092E\u0938\u094D\u0925\u0947' + (namePart ? ' ' + namePart : '') + ', \u092E Shrijal \u0939\u0941\u0901\u0964 \u092E \u0924\u092A\u093E\u0908\u0902\u0932\u093E\u0908 \u0915\u0938\u0930\u0940 \u0938\u0939\u092F\u094B\u0917 \u0917\u0930\u094D\u0928 \u0938\u0915\u094D\u0924\u0941?',
            'as': '\u0928\u092E\u0938\u094D\u0915\u093E\u0930' + (namePart ? ' ' + namePart : '') + ', \u09AE\u09C8 Shrijal. \u09AE\u09C8 \u0986\u09AA\u09CB\u09A8\u09BE\u0995\u09C7 \u0995\u09C7\u09A8\u09C7\u0995\u09C8\u09A8\u09C7 \u09B8\u09B9\u09BE\u09AF\u09BC \u0995\u09B0\u09BF \u09AA\u09BE\u09B0\u09BF?'
        };

        return greetings[shortLang] || greetings['en'];
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
        if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
    }

    // ── Initialization ────────────────────────────────────────────────────────

    function init(options = {}) {
        synthesis = window.speechSynthesis || null;
        onStateChange = options.onStateChange || (() => {});
        onTranscript = options.onTranscript || (() => {});
        onVoiceModeChange = options.onVoiceModeChange || (() => {});
        onOrbStateChange = options.onOrbStateChange || (() => {});

        // Use account's preferred language as default
        if (options.preferredLocale) {
            currentLanguage = options.preferredLocale;
        } else if (options.preferredLanguage) {
            currentLanguage = options.preferredLanguage + '-IN';
        }

        if (window.LanguageDetection) {
            conversationManager = window.LanguageDetection.createConversationManager();
        }

        loadCurrentUser();

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
                onStateChange('listening', 'Listening...');
                onOrbStateChange('listening');
            };

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
                if (event.error === 'not-allowed') {
                    onStateChange('error', 'Microphone access denied.');
                } else if (event.error === 'no-speech') {
                    onStateChange('', '');
                } else {
                    onStateChange('', '');
                }
                onOrbStateChange(voiceMode ? 'voice-active' : '');
            };

            recognition.onend = function () {
                isRecording = false;
                onStateChange('', '');
                if (voiceMode && !isSpeaking) {
                    onOrbStateChange('voice-active');
                    // Auto-restart listening in voice mode after a short delay
                    restartTimer = setTimeout(() => {
                        if (voiceMode && !isRecording && !isSpeaking) {
                            startListening();
                        }
                    }, 600);
                } else {
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

    function loadVoices() {
        if (!synthesis) return;
        const voices = synthesis.getVoices();
        if (voices.length > 0) selectBestIndianFemaleVoice(voices);
    }

    // Siri-like natural voices, best first (Apple Siri -> Windows natural -> Google natural)
    const SIRI_LIKE_NAMES = [
        'samantha', 'siri',
        'zira',
        'google us english', 'google uk english female',
        'hazel', 'victoria', 'karen', 'susan', 'moira', 'tessa', 'fiona',
        'salli', 'joanna', 'ivy', 'kimberly', 'alice', 'melina'
    ];

    function siriScore(voice) {
        const name = (voice.name || '').toLowerCase();
        for (let i = 0; i < SIRI_LIKE_NAMES.length; i++) {
            if (name.includes(SIRI_LIKE_NAMES[i])) return 100 - i;
        }
        return isFemaleVoice(voice) ? 10 : 0;
    }

    function pickNaturalVoice(voices, langFilter) {
        const pool = voices.filter(langFilter);
        if (!pool.length) return null;
        return pool.slice().sort((a, b) => siriScore(b) - siriScore(a))[0];
    }

    function selectBestIndianFemaleVoice(voices) {
        if (!voices || voices.length === 0) return;
        const lang = currentLanguage || 'en-IN';
        const shortLang = lang.split('-')[0];

        const stages = [
            vs => vs.filter(v => v.lang === lang),
            vs => vs.filter(v => v.lang === 'en-IN'),
            vs => vs.filter(v => v.lang === 'hi-IN'),
            vs => vs.filter(v => v.lang && v.lang.startsWith(shortLang)),
            vs => vs.filter(v => v.lang && v.lang.startsWith('en')),
            vs => vs
        ];

        for (const stage of stages) {
            const match = pickNaturalVoice(voices, v => stage([v]).length > 0);
            if (match) { selectedVoice = match; return; }
        }
        // Last resort: first available voice
        if (voices.length) selectedVoice = voices[0];
    }

    function isFemaleVoice(voice) {
        const name = (voice.name || '').toLowerCase();
        const indicators = [
            'female', 'woman', 'samantha', 'victoria', 'zira', 'susan',
            'karen', 'salli', 'joanna', 'ivy', 'kimberly', 'mizuki',
            'tessa', 'moira', 'fiona', 'alice', 'melina', 'paulina',
            'google.*female', 'microsoft.*zira', 'microsoft.*hazel',
            'microsoft.*susan', 'microsoft.*karen', 'apple.*female',
            'hindi.*female', 'bengali.*female', 'tamil.*female',
            'telugu.*female', 'kannada.*female', 'malayalam.*female'
        ];
        return indicators.some(i => name.includes(i));
    }

    function getVoiceForLanguage(langCode) {
        if (!synthesis) return null;
        const voices = synthesis.getVoices();
        const shortLang = (langCode || 'en-IN').split('-')[0];

        let v = pickNaturalVoice(voices, x => x.lang === langCode);
        if (v) return v;
        v = pickNaturalVoice(voices, x => x.lang && x.lang.startsWith(shortLang));
        if (v) return v;
        v = pickNaturalVoice(voices, x => x.lang && x.lang.startsWith('en'));
        if (v) return v;
        return selectedVoice;
    }

    // ── Text Cleaning for Speech ──────────────────────────────────────────────

    function prepareTextForSpeech(text) {
        if (!text) return '';
        let c = text;
        c = c.replace(/^#{1,6}\s+/gm, '');
        c = c.replace(/\*{1,3}/g, '');
        c = c.replace(/_{1,3}/g, '');
        c = c.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
        c = c.replace(/https?:\/\/[^\s]+/g, '');
        c = c.replace(/[\u{1F600}-\u{1F64F}]/gu, '');
        c = c.replace(/[\u{1F300}-\u{1F5FF}]/gu, '');
        c = c.replace(/[\u{1F680}-\u{1F6FF}]/gu, '');
        c = c.replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '');
        c = c.replace(/[\u{2600}-\u{26FF}]/gu, '');
        c = c.replace(/[\u{2700}-\u{27BF}]/gu, '');
        c = c.replace(/[\u{FE00}-\u{FE0F}]/gu, '');
        c = c.replace(/[\u{200D}]/gu, '');
        c = c.replace(/\*\*Sources?:\*\*/gi, 'Sources:');
        c = c.replace(/\d+\.\s*\*\*/g, '');
        c = c.replace(/<[^>]+>/g, '');
        c = c.replace(/```[\s\S]*?```/g, '');
        c = c.replace(/`[^`]+`/g, '');
        c = c.replace(/^[\s]*[-\u2022]\s+/gm, '');
        c = c.replace(/^\d+\.\s+/gm, '');
        c = c.replace(/\n{3,}/g, '. ');
        c = c.replace(/\n{2}/g, '. ');
        c = c.replace(/\n/g, ' ');
        c = c.replace(/\s{2,}/g, ' ');
        c = c.replace(/\.{2,}/g, '.');
        c = c.trim();
        if (c.length < 3) return '';
        return c;
    }

    // ── Browser TTS ───────────────────────────────────────────────────────────

    function speakText(text, lang) {
        return new Promise((resolve, reject) => {
            if (!synthesis) { resolve(); return; }

            synthesis.cancel();

            const cleaned = prepareTextForSpeech(text);
            if (!cleaned) { resolve(); return; }

            isSpeaking = true;
            onStateChange('speaking', 'Speaking...');
            onOrbStateChange('speaking');

            const utterance = new SpeechSynthesisUtterance(cleaned);
            const speakLang = lang || currentLanguage;
            const voice = getVoiceForLanguage(speakLang);
            if (voice) utterance.voice = voice;
            utterance.lang = speakLang;
            // Siri-like delivery: steady pace, bright friendly pitch
            utterance.rate = 1.02;
            utterance.pitch = 1.12;
            utterance.volume = 1;

            utterance.onstart = () => {
                isSpeaking = true;
            };

            utterance.onend = () => {
                isSpeaking = false;
                onStateChange('', '');
                onOrbStateChange(voiceMode ? 'voice-active' : '');
                speakResolve = null;
                resolve();
                if (voiceMode) {
                    restartTimer = setTimeout(() => {
                        if (voiceMode && !isRecording) {
                            startListening();
                        }
                    }, 800);
                }
            };

            utterance.onerror = (e) => {
                isSpeaking = false;
                onStateChange('', '');
                onOrbStateChange(voiceMode ? 'voice-active' : '');
                speakResolve = null;
                if (e.error === 'canceled' || e.error === 'interrupted') {
                    resolve();
                } else {
                    resolve();
                }
            };

            speakResolve = resolve;
            synthesis.speak(utterance);
        });
    }

    function stopSpeaking() {
        if (synthesis) synthesis.cancel();
        isSpeaking = false;
        if (speakResolve) { speakResolve(); speakResolve = null; }
    }

    // ── Listening Control ─────────────────────────────────────────────────────

    function startListening() {
        if (!recognition || !recognitionSupported || !voiceMode) return false;
        if (isRecording) return false;

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

    // ── Language Management ───────────────────────────────────────────────────

    function updateConversationLanguage(text) {
        if (!window.LanguageDetection || !conversationManager) return;
        const detected = conversationManager.updateLanguage(text);
        if (detected && detected.confidence >= 0.5) {
            const newLang = detected.code || 'en-IN';
            if (newLang !== currentLanguage) {
                currentLanguage = newLang;
                updateRecognitionLanguage();
                if (synthesis) selectBestIndianFemaleVoice(synthesis.getVoices());
            }
        }
    }

    function setCurrentLanguage(lang) {
        currentLanguage = lang;
        updateRecognitionLanguage();
        if (synthesis) selectBestIndianFemaleVoice(synthesis.getVoices());
    }

    function getCurrentLanguage() { return currentLanguage; }
    function getConversationManager() { return conversationManager; }

    // ── Voice Commands ────────────────────────────────────────────────────────

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

    // ── Voice Mode Toggle ─────────────────────────────────────────────────────

    function enableVoiceMode() {
        voiceMode = true;
        onVoiceModeChange(true);
        onOrbStateChange('voice-active');
    }

    function disableVoiceMode() {
        voiceMode = false;
        stopListening();
        stopSpeaking();
        isSpeaking = false;
        onStateChange('', '');
        onOrbStateChange('');
        onVoiceModeChange(false);
    }

    function toggleVoiceMode() {
        if (voiceMode) disableVoiceMode();
        else enableVoiceMode();
    }

    // ── Public API ────────────────────────────────────────────────────────────

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

    function setOrbState(state) { onOrbStateChange(state); }

    return {
        init,
        speakText,
        stopSpeaking,
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
        setOrbState,
        updateConversationLanguage,
        updateRecognitionLanguage,
        isRecognitionSupported,
        setReportContext,
        getReportContext,
        hasReportContext
    };
})();

if (typeof window !== 'undefined') window.ShrijalVoice = ShrijalVoice;
