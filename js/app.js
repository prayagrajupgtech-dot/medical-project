const API_BASE = '/api';

// Token management
function getToken() {
    return localStorage.getItem('token');
}

function getUser() {
    return JSON.parse(localStorage.getItem('user') || '{}');
}

function setAuth(token, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
}

function clearAuth() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
}

// Theme toggle
function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    const toggle = document.getElementById('themeToggle');
    if (toggle) {
        toggle.innerHTML = newTheme === 'dark' ? '☀️' : '🌙';
    }
}

// Restore saved theme
(function() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
    document.addEventListener('DOMContentLoaded', function() {
        const toggle = document.getElementById('themeToggle');
        if (toggle) {
            toggle.innerHTML = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
        }
    });
})();

function logout() {
    clearAuth();
    window.location.replace('/login');
}

// API helper
async function apiCall(endpoint, method = 'GET', data = null) {
    const options = {
        method: method,
        headers: { 'Content-Type': 'application/json' }
    };

    const token = getToken();
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }

    if (data) {
        options.body = JSON.stringify(data);
    }

    const response = await fetch(`${API_BASE}${endpoint}`, options);

    if (response.status === 401) {
        const hadToken = !!token;
        clearAuth();
        // No token + 401 = not a session problem (e.g. public call). Only flag expiry
        // when an existing session/token was actually rejected by the server.
        window.location.replace('/login' + (hadToken ? '?reason=session_expired' : ''));
        return;
    }

    return await response.json();
}

// Toast notifications (shared with main.js)
function showToast(message, type = 'success') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        container.setAttribute('aria-live', 'polite');
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast-hide');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// Show/hide modals
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Role-based dashboard redirect
function redirectToDashboard(role) {
    if (role === 'doctor') window.location.replace('/doctor/dashboard');
    else if (role === 'admin') window.location.replace('/admin/dashboard');
    else if (role === 'hospital_admin') window.location.replace('/hospital/dashboard');
    else if (role === 'staff') window.location.replace('/patient/dashboard');
    else window.location.replace('/patient/dashboard');
}

// Translate backend errors into user-friendly messages.
// "Session expired" is ONLY shown when a previously valid session actually expired
// (opts.sessionExpired). Invalid credentials are NEVER reported as session expiry.
function friendlyAuthError(status, rawError, opts) {
    opts = opts || {};
    const msg = String(rawError || '');
    if (opts.sessionExpired) {
        return 'Your session has expired. Please sign in again.';
    }
    if (status === 403 && /blocked/i.test(msg)) {
        return 'Your account has been blocked by the administrator. Please contact support for assistance.';
    }
    if (status === 401 && /no user found/i.test(msg)) {
        return 'No user found. Please check your credentials and try again.';
    }
    if (opts.invalidCredentials && (status === 401 || status === 403)) {
        return 'Invalid username or password.';
    }
    return msg || 'Something went wrong. Please try again.';
}

// Photo preview helper for registration
function bindRegPhotoPreview(inputId, previewId) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    if (!input || !preview) return;
    input.addEventListener('change', function () {
        preview.innerHTML = '';
        clearFieldError(input);
        const file = input.files && input.files[0];
        if (!file) return;
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowed.includes(file.type)) {
            setFieldError(input, 'Please upload a JPG, PNG, or WEBP image.');
            input.value = '';
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setFieldError(input, 'Image size must be less than 5 MB.');
            input.value = '';
            return;
        }
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.alt = 'Profile photo preview';
        img.className = 'reg-photo-img';
        preview.appendChild(img);
    });
}

// Upload the selected registration photo after the account is created
async function uploadRegistrationPhoto(role, token, inputId) {
    const input = document.getElementById(inputId);
    if (!input || !input.files || !input.files[0]) return;
    const file = input.files[0];
    // Server routes are pluralised: /api/doctors/me/photo, /api/patients/me/photo
    const base = role === 'admin' ? 'admin' : (role === 'doctor' ? 'doctors' : 'patients');
    const endpoint = '/api/' + base + (role === 'admin' ? '/profile/photo' : '/me/photo');
    const formData = new FormData();
    formData.append('photo', file);
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token },
        body: formData
    });
    if (!res.ok) return; // non-blocking: photo can be added later from the profile page
    const data = await res.json();
    if (data && data.photo) {
        const u = getUser();
        u.photo = data.photo;
        localStorage.setItem('user', JSON.stringify(u));
    }
}

document.addEventListener('DOMContentLoaded', function () {

    // One-time "session expired" notice. The flag is ONLY added when a protected
    // API/page rejected an existing session (genuine expiry), so a fresh /login
    // visit or a plain logout never shows it. Consumed once and removed from the URL.
    (function consumeSessionExpiredNotice() {
        const params = new URLSearchParams(window.location.search);
        const reason = params.get('reason');
        if (reason === 'session_expired' || reason === 'expired') {
            const message = 'Your session has expired. Please sign in again.';
            showFormAlert('loginAlert', message, 'error');
            showToast(message, 'error');
            params.delete('reason');
            const qs = params.toString();
            window.history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : '') + window.location.hash);
        }
    })();

    // ============ LOGIN FORM ============
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        const loginUsername = document.getElementById('loginUsername');
        const loginPassword = document.getElementById('loginPassword');

        [loginUsername, loginPassword].forEach(i => {
            if (i) i.addEventListener('input', () => clearFieldError(i));
        });

        loginForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            hideFormAlert('loginAlert');

            let valid = true;
            if (!loginUsername.value.trim()) {
                setFieldError(loginUsername, 'Username or email is required.');
                valid = false;
            }
            if (!loginPassword.value) {
                setFieldError(loginPassword, 'Password is required.');
                valid = false;
            }
            if (!valid) return;

            const submitBtn = document.getElementById('loginSubmit');
            setBusy(submitBtn, true, 'Signing In...', 'Sign In');

            const loginRoleInput = document.getElementById('loginRole');
            const selectedRole = loginRoleInput ? loginRoleInput.value : 'patient';

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: loginUsername.value.trim(),
                        password: loginPassword.value,
                        role: selectedRole
                    })
                });

                const result = await response.json();

                if (response.ok && result.token) {
                    setAuth(result.token, result.user);
                    showToast('Welcome back, ' + (result.user.full_name || result.user.username) + '!');
                    setTimeout(() => redirectToDashboard(result.user.role), 400);
                } else {
                    showFormAlert('loginAlert', friendlyAuthError(response.status, result.error, { invalidCredentials: true }), 'error');
                }
            } catch (error) {
                showFormAlert('loginAlert', 'Connection error. Please try again.', 'error');
            } finally {
                setBusy(submitBtn, false, 'Signing In...', 'Sign In');
            }
        });
    }

    // ============ REGISTER FORM ============
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        const regRole = document.getElementById('regRole');
        const doctorFields = document.getElementById('doctorFields');
        const patientFields = document.getElementById('patientFields');
        const adminFields = document.getElementById('adminFields');
        const regAdminOption = document.getElementById('regAdminOption');
        const regRoleHint = document.getElementById('regRoleHint');
        const regPassword = document.getElementById('regPassword');
        const regConfirm = document.getElementById('regConfirm');
        const requiredInputs = ['regFirstName', 'regLastName', 'regUsername', 'regEmail', 'regPhone', 'regPassword', 'regConfirm'];
        const roleSections = { doctor: doctorFields, patient: patientFields, admin: adminFields };
        const roleFieldIds = {
            doctor: ['regSpecialty', 'regQualification', 'regRegNumber', 'regExperience', 'regHospital', 'regBio', 'regDoctorPhoto'],
            patient: ['regDob', 'regGender', 'regPatientPhoto'],
            admin: ['regAdminKey']
        };

        // Show/hide the Admin option based on server config (dev mode + secret set)
        (async function loadAuthConfig() {
            try {
                const res = await fetch('/api/auth/config');
                const cfg = await res.json();
                if (cfg.adminRegistration) {
                    if (regAdminOption) regAdminOption.hidden = false;
                    if (regRoleHint) regRoleHint.textContent = 'Admin registration requires a secure administrator registration key.';
                }
            } catch (e) { /* keep Admin hidden if the config cannot be loaded */ }
        })();

        // Clear fields that no longer apply when switching roles
        function clearRoleFields(newRole) {
            Object.keys(roleFieldIds).forEach(function (role) {
                if (role === newRole) return;
                roleFieldIds[role].forEach(function (id) {
                    const el = document.getElementById(id);
                    if (!el) return;
                    if (el.type === 'file') { el.value = ''; }
                    else { el.value = ''; }
                    clearFieldError(el);
                });
            });
            ['doctorPhotoPreview', 'patientPhotoPreview'].forEach(function (id) {
                const p = document.getElementById(id);
                if (p) p.innerHTML = '';
            });
        }

        // Wire password strength meter
        bindPasswordToggles();
        if (regPassword) {
            regPassword.addEventListener('input', function () {
                renderStrengthMeter(regPassword);
                clearFieldError(regPassword);
                if (regConfirm.value) clearFieldError(regConfirm);
            });
        }
        if (regConfirm) regConfirm.addEventListener('input', () => clearFieldError(regConfirm));

        // Role-dependent fields
        function toggleRoleFields() {
            const role = regRole.value;
            if (doctorFields) doctorFields.classList.toggle('hidden', role !== 'doctor');
            if (patientFields) patientFields.classList.toggle('hidden', role !== 'patient');
            if (adminFields) adminFields.classList.toggle('hidden', role !== 'admin');
            const spec = document.getElementById('regSpecialty');
            if (spec) spec.required = role === 'doctor';
            const key = document.getElementById('regAdminKey');
            if (key) key.required = role === 'admin';
        }

        if (regRole) {
            regRole.addEventListener('change', function () {
                clearRoleFields(regRole.value);
                toggleRoleFields();
                clearFieldError(regRole);
            });
        }

        // Photo previews
        bindRegPhotoPreview('regDoctorPhoto', 'doctorPhotoPreview');
        bindRegPhotoPreview('regPatientPhoto', 'patientPhotoPreview');

        // Clear validation on input
        requiredInputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => clearFieldError(el));
        });
        ['regSpecialty', 'regQualification', 'regRegNumber', 'regExperience', 'regHospital', 'regBio', 'regDob', 'regGender', 'regAdminKey']
            .forEach(id => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('input', () => clearFieldError(el));
            });

        registerForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            hideFormAlert('registerAlert');

            let valid = true;

            if (!regRole.value) { setFieldError(regRole, 'Please select your role.'); valid = false; }

            const get = (id) => document.getElementById(id);
            const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const role = regRole.value;

            requiredInputs.forEach(id => {
                const el = get(id);
                if (!el.value.trim()) {
                    setFieldError(el, (el.labels && el.labels[0] ? el.labels[0].textContent.trim().replace(/\*$/, '').trim() : 'This field') + ' is required.');
                    valid = false;
                }
            });

            const emailEl = get('regEmail');
            if (valid && !emailPattern.test(emailEl.value.trim())) {
                setFieldError(emailEl, 'Please enter a valid email address.');
                valid = false;
            }

            if (valid && role === 'doctor') {
                const spec = get('regSpecialty');
                if (!spec.value.trim()) {
                    setFieldError(spec, 'Specialty is required for doctors.');
                    valid = false;
                }
            }

            if (valid && role === 'admin') {
                const key = get('regAdminKey');
                if (!key.value.trim()) {
                    setFieldError(key, 'Administrator registration key is required.');
                    valid = false;
                }
            }

            if (valid) {
                const score = passwordScore(regPassword.value);
                if (score < 4) {
                    setFieldError(regPassword, 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number.');
                    valid = false;
                }
            }

            if (valid && regPassword.value !== regConfirm.value) {
                setFieldError(regConfirm, 'Passwords do not match.');
                valid = false;
            }

            if (!valid) return;

            const submitBtn = document.getElementById('registerSubmit');
            setBusy(submitBtn, true, 'Creating Account...', 'Create Account');

            const data = {
                username: get('regUsername').value.trim(),
                email: get('regEmail').value.trim(),
                password: regPassword.value,
                full_name: (get('regFirstName').value.trim() + ' ' + get('regLastName').value.trim()).trim(),
                phone: get('regPhone').value.trim(),
                role: role
            };

            if (role === 'doctor') {
                data.specialty = get('regSpecialty').value.trim();
                data.qualification = get('regQualification').value.trim() || undefined;
                data.registration_number = get('regRegNumber').value.trim() || undefined;
                data.experience_years = get('regExperience').value ? Number(get('regExperience').value) : undefined;
                data.hospital = get('regHospital').value.trim() || undefined;
                data.bio = get('regBio').value.trim() || undefined;
            }

            if (role === 'patient') {
                data.date_of_birth = get('regDob').value || undefined;
                data.gender = get('regGender').value || undefined;
            }

            if (role === 'admin') {
                data.adminRegistrationKey = get('regAdminKey').value.trim();
            }

            try {
                const response = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (response.ok && result.token) {
                    setAuth(result.token, result.user);
                    const photoInputId = role === 'doctor' ? 'regDoctorPhoto' : 'regPatientPhoto';
                    try {
                        await uploadRegistrationPhoto(role, result.token, photoInputId);
                    } catch (photoErr) { /* non-blocking */ }
                    showToast('Account created successfully! Welcome!');
                    setTimeout(() => redirectToDashboard(result.user.role), 500);
                } else {
                    showFormAlert('registerAlert', friendlyAuthError(response.status, result.error), 'error');
                }
            } catch (error) {
                showFormAlert('registerAlert', 'Connection error. Please try again.', 'error');
            } finally {
                setBusy(submitBtn, false, 'Creating Account...', 'Create Account');
            }
        });

        // Initialise on load
        toggleRoleFields();
    }

    // Close modals when clicking outside
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function (e) {
            if (e.target === modal) {
                modal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    });
});

// Toggle form visibility
function showRegister() {
    const loginCard = document.getElementById('loginCard');
    const registerCard = document.getElementById('registerCard');
    if (loginCard) loginCard.classList.add('hidden');
    if (registerCard) {
        registerCard.classList.remove('hidden');
        const first = registerCard.querySelector('input, select, button');
        if (first) setTimeout(() => first.focus(), 50);
    }
}

function showLogin() {
    const loginCard = document.getElementById('loginCard');
    const registerCard = document.getElementById('registerCard');
    if (registerCard) registerCard.classList.add('hidden');
    if (loginCard) {
        loginCard.classList.remove('hidden');
        const first = loginCard.querySelector('input');
        if (first) setTimeout(() => first.focus(), 50);
    }
}

// Doctor/patient auth redirects
function requireAuth(allowedRoles = []) {
    const token = getToken();
    const user = getUser();

    if (!token || !user.id) {
        window.location.replace('/login');
        return false;
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
        window.location.replace('/login');
        return false;
    }

    return true;
}