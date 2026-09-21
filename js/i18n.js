/**
 * Shrijal I18n — Internationalization System
 * Single reusable i18n provider for all roles.
 * Architecture: key-based translations with English fallback.
 */

const ShrijalI18n = (() => {

    let currentLanguage = 'en';
    let currentLocale = 'en-IN';
    let translations = {};
    let fallbackTranslations = {};
    let onLanguageChange = null;
    let loaded = false;
    let initialized = false;

    const SUPPORTED = ['en','hi','bn','mr','ta','te','gu','kn','ml','pa','or','as','ur','ne'];
    const LOCALES = {
        'en':'en-IN','hi':'hi-IN','bn':'bn-IN','mr':'mr-IN','ta':'ta-IN',
        'te':'te-IN','gu':'gu-IN','kn':'kn-IN','ml':'ml-IN','pa':'pa-IN',
        'or':'or-IN','as':'as-IN','ur':'ur-IN','ne':'ne-IN'
    };
    const RTL_LANGUAGES = ['ur'];

    const NATIVE_NAMES = {
        'en':'English','hi':'\u0939\u093F\u0928\u094D\u0926\u0940','bn':'\u09AC\u09BE\u0982\u09B2\u09BE',
        'mr':'\u092E\u0930\u093E\u0920\u0940','ta':'\u0A4D\u0A35\u0A3F\u0A34\u0BCD','te':'\u0C24\u0C46\u0C32\u0C41\u0C17\u0C41',
        'gu':'\u0A97\u0AC1\u0A9C\u0AB0\u0ABE\u0AA4\u0AC0','kn':'\u0C95\u0CA8\u0CCD\u0CA8\u0CA1',
        'ml':'\u0D2E\u0D32\u0D2F\u0D3E\u0D33\u0D02','pa':'\u0A2A\u0A70\u0A1C\u0A3E\u0A2A\u0A40',
        'or':'\u0B13\u0B21\u0B3C\u0BFF\u0B06','as':'\u0905\u0938\u092E\u0940\u092F\u093E\u0935\u093E\u0939\u093F',
        'ur':'\u0627\u0631\u062F\u0648','ne':'\u0928\u0947\u092A\u093E\u0932\u0940'
    };

    // ── Translation Loading ────────────────────────────────────────────────

    async function loadTranslations(lang) {
        if (lang === 'en') {
            translations = {};
            return true;
        }
        try {
            const resp = await fetch('/locales/' + lang + '/common.json');
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            translations = await resp.json();
            return true;
        } catch (e) {
            console.warn('[I18n] Failed to load translations for ' + lang + ':', e.message);
            translations = {};
            return false;
        }
    }

    async function loadFallback() {
        try {
            const resp = await fetch('/locales/en/common.json');
            if (!resp.ok) return;
            fallbackTranslations = await resp.json();
        } catch (e) {
            fallbackTranslations = {};
        }
    }

    // ── Translation Function ───────────────────────────────────────────────

    function t(key, params) {
        if (!key) return '';
        let val = getNestedValue(translations, key);
        if (val === undefined || val === null) {
            val = getNestedValue(fallbackTranslations, key);
        }
        if (val === undefined || val === null) {
            return key;
        }
        if (typeof val !== 'string') return String(val);
        if (params) {
            Object.keys(params).forEach(function(k) {
                val = val.replace(new RegExp('\\{' + k + '\\}', 'g'), params[k]);
            });
        }
        return val;
    }

    function getNestedValue(obj, path) {
        if (!obj || !path) return undefined;
        var keys = path.split('.');
        var current = obj;
        for (var i = 0; i < keys.length; i++) {
            if (current === null || current === undefined) return undefined;
            current = current[keys[i]];
        }
        return current;
    }

    // ── Language Initialization ────────────────────────────────────────────

    async function init(options) {
        if (loaded) return;
        onLanguageChange = (options && options.onLanguageChange) || null;

        try { await loadFallback(); } catch (e) {}

        var user = null;
        try {
            var raw = localStorage.getItem('user');
            if (raw) user = JSON.parse(raw);
        } catch (e) {}

        var savedLang = (user && user.preferredLanguage) || 'en';
        if (!SUPPORTED.includes(savedLang)) savedLang = 'en';

        try { await setLanguage(savedLang, false); } catch (e) {}
        loaded = true;
        initialized = true;
    }

    async function setLanguage(lang, saveToServer) {
        if (!SUPPORTED.includes(lang)) lang = 'en';
        var oldLang = currentLanguage;
        currentLanguage = lang;
        currentLocale = LOCALES[lang] || 'en-IN';

        await loadTranslations(lang);

        applyLanguageToDOM();

        if (saveToServer !== false && oldLang !== lang) {
            saveLanguageToServer(lang);
        }

        if (initialized && onLanguageChange) onLanguageChange(lang, currentLocale);
    }

    function saveLanguageToServer(lang) {
        var token = localStorage.getItem('token');
        if (!token) return;
        fetch('/api/user/language', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ preferredLanguage: lang })
        }).then(function(resp) { return resp.json(); }).then(function(data) {
            if (data.preferredLanguage) {
                var user = null;
                try { user = JSON.parse(localStorage.getItem('user')); } catch (e) {}
                if (user) {
                    user.preferredLanguage = data.preferredLanguage;
                    user.preferredLocale = data.preferredLocale;
                    localStorage.setItem('user', JSON.stringify(user));
                }
            }
        }).catch(function() {});
    }

    // ── DOM Application ────────────────────────────────────────────────────

    function applyLanguageToDOM() {
        document.documentElement.lang = currentLanguage;
        document.documentElement.dir = RTL_LANGUAGES.includes(currentLanguage) ? 'rtl' : 'ltr';

        document.querySelectorAll('[data-i18n]').forEach(function(el) {
            var key = el.getAttribute('data-i18n');
            var val = t(key);
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                if (el.hasAttribute('placeholder')) {
                    el.setAttribute('placeholder', val);
                } else {
                    el.textContent = val;
                }
            } else {
                el.textContent = val;
            }
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
            var key = el.getAttribute('data-i18n-placeholder');
            el.setAttribute('placeholder', t(key));
        });

        document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
            var key = el.getAttribute('data-i18n-title');
            el.setAttribute('title', t(key));
        });

        document.querySelectorAll('[data-i18n-aria]').forEach(function(el) {
            var key = el.getAttribute('data-i18n-aria');
            el.setAttribute('aria-label', t(key));
        });
    }

    // ── Language Selector Component ────────────────────────────────────────

    function createLanguageSelector(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        var html = '<div class="admin-card" style="margin-top:16px;">';
        html += '<div class="card-header"><h3 data-i18n="language_and_region">\uD83C\uDF10 Language & Region</h3></div>';
        html += '<div class="card-body">';
        html += '<p data-i18n="choose_language" style="margin-bottom:12px;color:var(--gray);">Choose your preferred language</p>';
        html += '<label style="display:block;margin-bottom:6px;font-weight:500;" data-i18n="language">Language</label>';
        html += '<select id="languageSelect" style="width:100%;padding:10px;border:1.5px solid var(--border-color);border-radius:10px;font-family:inherit;font-size:0.9rem;background:var(--bg-card);color:var(--text-primary);">';
        SUPPORTED.forEach(function(lang) {
            var sel = (lang === currentLanguage) ? ' selected' : '';
            html += '<option value="' + lang + '"' + sel + '>' + NATIVE_NAMES[lang] + ' (' + lang.toUpperCase() + ')</option>';
        });
        html += '</select>';
        html += '<p style="font-size:0.8rem;color:var(--gray);margin-top:8px;" data-i18n="language_description">Your account interface and system messages will appear in your selected language.</p>';
        html += '<button class="btn btn-primary" onclick="ShrijalI18n.saveLanguageFromUI()" style="margin-top:12px;" data-i18n="save_changes">Save Changes</button>';
        html += '<span id="langSaveMsg" style="margin-left:12px;color:var(--success,#10b981);font-size:0.85rem;display:none;"></span>';
        html += '</div></div>';

        container.innerHTML = html;
    }

    function saveLanguageFromUI() {
        var select = document.getElementById('languageSelect');
        if (!select) return;
        var lang = select.value;
        setLanguage(lang, true).then(function() {
            var msg = document.getElementById('langSaveMsg');
            if (msg) {
                msg.textContent = t('language_updated') || 'Language updated successfully.';
                msg.style.display = 'inline';
                setTimeout(function() { msg.style.display = 'none'; }, 3000);
            }
        });
    }

    // ── Date/Number Formatting ─────────────────────────────────────────────

    function formatDate(dateStr) {
        if (!dateStr) return '';
        try {
            var d = new Date(dateStr);
            return d.toLocaleDateString(currentLocale);
        } catch (e) { return dateStr; }
    }

    function formatDateTime(dateStr) {
        if (!dateStr) return '';
        try {
            var d = new Date(dateStr);
            return d.toLocaleString(currentLocale);
        } catch (e) { return dateStr; }
    }

    function formatNumber(num) {
        if (num === null || num === undefined) return '';
        try {
            return new Intl.NumberFormat(currentLocale).format(num);
        } catch (e) { return String(num); }
    }

    // ── Role/Status Translation ────────────────────────────────────────────

    function translateRole(role) {
        var key = 'role_' + (role || 'unknown');
        var val = t(key);
        return val !== key ? val : (role || 'Unknown');
    }

    function translateStatus(status) {
        var key = 'status_' + (status || 'unknown');
        var val = t(key);
        return val !== key ? val : (status || 'Unknown');
    }

    // ── Public API ─────────────────────────────────────────────────────────

    return {
        init: init,
        setLanguage: setLanguage,
        t: t,
        createLanguageSelector: createLanguageSelector,
        saveLanguageFromUI: saveLanguageFromUI,
        applyLanguageToDOM: applyLanguageToDOM,
        formatDate: formatDate,
        formatDateTime: formatDateTime,
        formatNumber: formatNumber,
        translateRole: translateRole,
        translateStatus: translateStatus,
        getLanguage: function() { return currentLanguage; },
        getLocale: function() { return currentLocale; },
        getNativeName: function(lang) { return NATIVE_NAMES[lang] || lang; },
        isRTL: function() { return RTL_LANGUAGES.includes(currentLanguage); },
        getSupported: function() { return SUPPORTED.slice(); },
        setOnLanguageChange: function(fn) { onLanguageChange = fn; }
    };

})();

if (typeof window !== 'undefined') window.ShrijalI18n = ShrijalI18n;
