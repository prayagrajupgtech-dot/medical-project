// AI Doctor Assistant - shared auth page components
// Logo component, password visibility toggles, password strength meter and inline validation.
// The brand logo is a neutral medical emblem. Swap the asset for an officially licensed
// logo (e.g. WHO) in one place when authorization is obtained.
(function () {
    'use strict';

    // Brand logo markup (single source of truth - reuse across login/register/forgot/reset)
    function brandLogoMarkup(className) {
        return '<img src="/images/brand-logo.svg" alt="AI Doctor Assistant logo" ' +
            'class="brand-logo' + (className ? ' ' + className : '') + '" width="64" height="64">';
    }

    function renderBrandLogo(containerId) {
        const el = document.getElementById(containerId);
        if (el) el.innerHTML = brandLogoMarkup();
    }

    // Password visibility toggles for every .password-field on the page.
    // Safe to call repeatedly — each button is bound only once.
    function bindPasswordToggles() {
        document.querySelectorAll('.password-field').forEach(function (field) {
            const input = field.querySelector('input[type="password"]');
            const btn = field.querySelector('.password-toggle');
            if (!input || !btn) return;
            if (btn.getAttribute('data-pw-bound') === '1') return;
            btn.setAttribute('data-pw-bound', '1');
            btn.setAttribute('aria-label', 'Show password');
            btn.addEventListener('click', function () {
                const show = input.type === 'password';
                input.type = show ? 'text' : 'password';
                btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
                btn.classList.toggle('visible', show);
                input.focus();
            });
        });
    }

    // Self-healing: bind as soon as this file loads (it is included at the end
    // of <body>, so the fields already exist) and once more after DOMContentLoaded.
    // This keeps the eye button working even if a page never calls it explicitly.
    try {
        bindPasswordToggles();
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', bindPasswordToggles);
        }
    } catch (e) { /* never block the rest of the page */ }

    // Password strength scoring: 0-4 based on length, upper, lower, digit
    function passwordScore(pw) {
        const s = String(pw || '');
        let score = 0;
        if (s.length >= 8) score++;
        if (/[A-Z]/.test(s)) score++;
        if (/[a-z]/.test(s)) score++;
        if (/\d/.test(s)) score++;
        return score;
    }

    function passwordStrengthLabel(pw) {
        const s = passwordScore(pw);
        if (s <= 1) return { label: 'Weak', cls: 'weak' };
        if (s === 2 || s === 3) return { label: 'Medium', cls: 'medium' };
        return { label: 'Strong', cls: 'strong' };
    }

    // Renders the strength meter + requirement checklist for a password input
    function renderStrengthMeter(input) {
        const wrap = input.closest('.password-strength-wrap');
        if (!wrap) return;
        const meter = wrap.querySelector('.strength-meter');
        const label = wrap.querySelector('.strength-label');
        if (!meter || !label) return;
        const pw = input.value;
        const s = passwordScore(pw);
        const level = passwordStrengthLabel(pw);
        meter.style.width = (s / 4) * 100 + '%';
        meter.className = 'strength-meter ' + level.cls;
        label.textContent = pw ? level.label : '';
        label.className = 'strength-label ' + level.cls;
        wrap.querySelectorAll('.req-item').forEach(function (item) {
            const kind = item.getAttribute('data-req');
            let ok = false;
            if (kind === 'length') ok = pw.length >= 8;
            else if (kind === 'upper') ok = /[A-Z]/.test(pw);
            else if (kind === 'lower') ok = /[a-z]/.test(pw);
            else if (kind === 'number') ok = /\d/.test(pw);
            item.classList.toggle('met', ok);
        });
    }

    // Inline field-level errors
    function setFieldError(input, message) {
        const field = input.closest('.form-group');
        if (!field) return;
        field.classList.add('has-error');
        input.setAttribute('aria-invalid', 'true');
        let err = field.querySelector('.field-error');
        if (!err) {
            err = document.createElement('span');
            err.className = 'field-error';
            field.appendChild(err);
        }
        err.textContent = message;
    }

    function clearFieldError(input) {
        const field = input.closest('.form-group');
        if (!field) return;
        field.classList.remove('has-error');
        input.removeAttribute('aria-invalid');
        const err = field.querySelector('.field-error');
        if (err) err.remove();
    }

    // Show a form-level alert banner
    function showFormAlert(containerId, message, type) {
        const box = document.getElementById(containerId);
        if (!box) return;
        box.textContent = message;
        box.className = 'form-alert' + (type ? ' ' + type : '');
        box.hidden = false;
        box.setAttribute('role', type === 'error' ? 'alert' : 'status');
    }

    function hideFormAlert(containerId) {
        const box = document.getElementById(containerId);
        if (box) {
            box.hidden = true;
            box.textContent = '';
        }
    }

    // Set a submit button busy state
    function setBusy(btn, busy, busyText, idleText) {
        if (!btn) return;
        btn.disabled = busy;
        if (busy) {
            btn.setAttribute('data-idle-text', idleText || btn.textContent);
            btn.textContent = busyText;
        } else {
            btn.textContent = btn.getAttribute('data-idle-text') || idleText || btn.textContent;
        }
    }

    window.brandLogoMarkup = brandLogoMarkup;
    window.renderBrandLogo = renderBrandLogo;
    window.bindPasswordToggles = bindPasswordToggles;
    window.passwordScore = passwordScore;
    window.passwordStrengthLabel = passwordStrengthLabel;
    window.renderStrengthMeter = renderStrengthMeter;
    window.setFieldError = setFieldError;
    window.clearFieldError = clearFieldError;
    window.showFormAlert = showFormAlert;
    window.hideFormAlert = hideFormAlert;
    window.setBusy = setBusy;
})();