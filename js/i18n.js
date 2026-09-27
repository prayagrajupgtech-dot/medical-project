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
    let initPromise = null;
    // Translations are fetched once per language and reused for the whole
    // session, so switching back and forth never re-downloads a dictionary.
    const langCache = {};

    const SUPPORTED = ['en','hi','bn','mr','ta','te','gu','kn','ml','pa','or','as','ur','ne'];
    const LOCALES = {
        'en':'en-IN','hi':'hi-IN','bn':'bn-IN','mr':'mr-IN','ta':'ta-IN',
        'te':'te-IN','gu':'gu-IN','kn':'kn-IN','ml':'ml-IN','pa':'pa-IN',
        'or':'or-IN','as':'as-IN','ur':'ur-IN','ne':'ne-NP'
    };
    const RTL_LANGUAGES = ['ur'];

    const NATIVE_NAMES = {
        'en':'English','hi':'\u0939\u093F\u0928\u094D\u0926\u0940','bn':'\u09AC\u09BE\u0982\u09B2\u09BE',
        'mr':'\u092E\u0930\u093E\u0920\u0940','ta':'\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD','te':'\u0C24\u0C46\u0C32\u0C41\u0C17\u0C41',
        'gu':'\u0A97\u0AC1\u0A9C\u0AB0\u0ABE\u0AA4\u0AC0','kn':'\u0C95\u0CA8\u0CCD\u0CA8\u0CA1',
        'ml':'\u0D2E\u0D32\u0D2F\u0D3E\u0D33\u0D02','pa':'\u0A2A\u0A70\u0A1C\u0A3E\u0A2A\u0A40',
        'or':'\u0B13\u0B21\u0B3C\u0B3F\u0B06','as':'\u0985\u09B8\u09AE\u0940\u09DF\u09BE',
        'ur':'\u0627\u0631\u062F\u0648','ne':'\u0928\u0947\u092A\u093E\u0932\u0940'
    };

    // ── Translation Loading ────────────────────────────────────────────────

    async function loadTranslations(lang) {
        if (lang === 'en') {
            translations = {};
            return true;
        }
        if (langCache[lang]) {
            translations = langCache[lang];
            return true;
        }
        try {
            const resp = await fetch('/locales/' + lang + '/common.json');
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const data = await resp.json();
            langCache[lang] = data;
            translations = data;
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

    // ── Saved Language Resolution ──────────────────────────────────────────
    // localStorage is only a cache. The database is the source of truth for
    // an authenticated account, so every account loads its OWN language and a
    // stale localStorage value can never override the server. We talk to the
    // server once per tab session and reuse the refreshed cache afterwards,
    // so this costs at most one request — never a per-render request loop.

    function readCachedUser() {
        try {
            var raw = localStorage.getItem('user');
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    function normalise(lang) {
        return SUPPORTED.indexOf(lang) !== -1 ? lang : 'en';
    }

    async function resolveSavedLanguage() {
        var user = readCachedUser();
        var lang = normalise(user && user.preferredLanguage);

        var token = null;
        try { token = localStorage.getItem('token'); } catch (e) {}
        if (!token) return lang;

        var needsSync = true;
        try { needsSync = !sessionStorage.getItem('i18n_synced'); } catch (e) {}
        if (!needsSync) return lang;

        try {
            var resp = await fetch('/api/auth/me', { headers: { 'Authorization': 'Bearer ' + token } });
            var data = resp.ok ? await resp.json() : null;
            var serverUser = data && data.user;
            if (serverUser) {
                lang = normalise(serverUser.preferredLanguage);
                if (user) {
                    user.preferredLanguage = serverUser.preferredLanguage || 'en';
                    user.preferredLocale = serverUser.preferredLocale || user.preferredLocale || null;
                    try { localStorage.setItem('user', JSON.stringify(user)); } catch (e) {}
                }
            }
            // Any settled HTTP answer counts as synced; only a network failure
            // or a 5xx is retried on the next page.
            if (data !== null || resp.status < 500) {
                try { sessionStorage.setItem('i18n_synced', '1'); } catch (e) {}
            }
        } catch (e) { /* offline or slow — keep the cached language */ }

        return lang;
    }

    // init() is single-flight. bootPage() (main.js) and the page's own script
    // both call it on the same tick; the old `if (loaded) return` guard lost
    // that race because `loaded` is only set after two awaits, so init ran
    // TWICE: the second run overwrote onLanguageChange (the settings pages
    // passed `location.reload`) and, once `initialized` was already true,
    // setLanguage fired it -> infinite page reload -> the screen blinked and
    // the page never finished loading. A second run also re-fetched
    // /locales/<lang>/common.json for nothing.
    function init(options) {
        var cb = (options && typeof options.onLanguageChange === 'function') ? options.onLanguageChange : null;

        if (initPromise) {
            // Join the run that is already in flight. A late caller may
            // register a callback only while none is registered; it can never
            // replace the one that bootPage installed.
            if (cb && !onLanguageChange) onLanguageChange = cb;
            return initPromise;
        }
        if (cb) onLanguageChange = cb;

        initPromise = (async function () {
            try { await loadFallback(); } catch (e) {}

            // Database first (once per session), localStorage as cache.
            var savedLang = 'en';
            try { savedLang = await resolveSavedLanguage(); } catch (e) { savedLang = 'en'; }

            try { await setLanguage(savedLang, false); } catch (e) {}
            loaded = true;
            initialized = true;
        })();

        return initPromise;
    }

    async function setLanguage(lang, saveToServer) {
        if (!SUPPORTED.includes(lang)) lang = 'en';
        var oldLang = currentLanguage;
        currentLanguage = lang;
        currentLocale = LOCALES[lang] || 'en-IN';

        await loadTranslations(lang);

        applyLanguageToDOM();

        var saveResult = null;
        if (saveToServer !== false && oldLang !== lang) {
            saveResult = await saveLanguageToServer(lang);
        }

        // Let any page re-render its API-driven content if it wants to; the
        // static markup is already re-translated by applyLanguageToDOM above.
        try {
            document.dispatchEvent(new CustomEvent('shrijal:languagechange', {
                detail: { language: lang, locale: currentLocale }
            }));
        } catch (e) {}

        // Notify listeners only on a real change, and only once. Re-applying
        // the same language must never re-run page-level handlers.
        if (initialized && onLanguageChange && oldLang !== lang) onLanguageChange(lang, currentLocale);

        return saveResult;
    }

    // Resolves to { ok: boolean, error?: string } and never rejects, so a
    // failed save can be reported instead of silently losing the preference.
    function saveLanguageToServer(lang) {
        var token = localStorage.getItem('token');
        if (!token) return Promise.resolve({ ok: true, skipped: true });
        return fetch('/api/user/language', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ preferredLanguage: lang })
        }).then(function(resp) {
            return resp.json().catch(function() { return {}; }).then(function(data) {
                if (!resp.ok) return { ok: false, error: data.error || ('HTTP ' + resp.status) };
                if (data.preferredLanguage) {
                    var user = null;
                    try { user = JSON.parse(localStorage.getItem('user')); } catch (e) {}
                    if (user) {
                        user.preferredLanguage = data.preferredLanguage;
                        user.preferredLocale = data.preferredLocale;
                        localStorage.setItem('user', JSON.stringify(user));
                    }
                }
                return { ok: true };
            });
        }).catch(function(err) {
            return { ok: false, error: (err && err.message) || 'network' };
        });
    }

    // ── DOM Application ────────────────────────────────────────────────────

    function hasTranslation(key) {
        return getNestedValue(translations, key) !== undefined ||
               getNestedValue(fallbackTranslations, key) !== undefined;
    }

    function applyLanguageToDOM() {
        document.documentElement.lang = currentLanguage;
        document.documentElement.dir = RTL_LANGUAGES.includes(currentLanguage) ? 'rtl' : 'ltr';

        // Keep the language picker in sync when the language changes from
        // anywhere other than the picker itself (init, logout/login, back nav).
        var picker = document.getElementById('languageSelect');
        if (picker && picker.value !== currentLanguage) picker.value = currentLanguage;

        document.querySelectorAll('[data-i18n]').forEach(function(el) {
            var key = el.getAttribute('data-i18n');
            if (!hasTranslation(key)) return; // keep original text, never show raw keys
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
            if (!hasTranslation(key)) return;
            el.setAttribute('placeholder', t(key));
        });

        document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
            var key = el.getAttribute('data-i18n-title');
            if (!hasTranslation(key)) return;
            el.setAttribute('title', t(key));
        });

        document.querySelectorAll('[data-i18n-aria]').forEach(function(el) {
            var key = el.getAttribute('data-i18n-aria');
            if (!hasTranslation(key)) return;
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

        // The selector markup is injected after the page's own
        // applyLanguageToDOM() pass, so translate it right here — otherwise
        // "Language & Region" stays English until the next language change.
        applyLanguageToDOM();
    }

    function saveLanguageFromUI() {
        var select = document.getElementById('languageSelect');
        if (!select) return;
        var lang = select.value;
        // Save locally FIRST so reload shows the right language even if server is slow
        try {
            var user = JSON.parse(localStorage.getItem('user') || 'null');
            if (user) {
                user.preferredLanguage = lang;
                user.preferredLocale = LOCALES[lang] || 'en-IN';
                localStorage.setItem('user', JSON.stringify(user));
            }
        } catch (e) {}
        setLanguage(lang, true).then(function(result) {
            var msg = document.getElementById('langSaveMsg');
            if (!msg) return;
            var ok = !result || result.ok !== false;
            msg.textContent = ok ? t('language_updated') : t('language_save_failed');
            msg.style.color = ok ? 'var(--success, #10b981)' : 'var(--danger, #dc2626)';
            msg.style.display = 'inline';
            setTimeout(function() { msg.style.display = 'none'; }, ok ? 3000 : 6000);
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

if (typeof window !== 'undefined') {
    window.ShrijalI18n = ShrijalI18n;
    // Global shortcut so any page script can translate dynamic strings
    // (toasts, table cells, empty states) without re-declaring its own helper.
    // Pages that declare a local `t`/`tr` simply shadow this one.
    window.t = function (key, params) { return ShrijalI18n.t(key, params); };
}
