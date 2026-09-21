// AI Doctor Assistant - Main JavaScript
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

// Theme management
function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    // Update button text
    const toggle = document.getElementById('themeToggle');
    if (toggle) {
        toggle.innerHTML = newTheme === 'dark' ? '☀️' : '🌙';
    }
    showToast(`Switched to ${newTheme.charAt(0).toUpperCase() + newTheme.slice(1)} Mode`);
}

async function logout() {
    try {
        await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + getToken() }
        });
    } catch (e) {
        // Proceed with local logout even if the API is unreachable
    }
    clearAuth();
    window.location.replace('/login');
}

// API helper - throws Error with server-provided message
async function api(endpoint, method = 'GET', data = null) {
    const options = {
        method: method,
        headers: { 'Content-Type': 'application/json' }
    };

    const token = getToken();
    if (token) {
        options.headers['Authorization'] = 'Bearer ' + token;
    }

    if (data) {
        options.body = JSON.stringify(data);
    }

    const response = await fetch(API_BASE + endpoint, options);

    if (response.status === 401) {
        const hadToken = !!token;
        clearAuth();
        // No token + 401 = not a session problem (e.g. public call). Only flag expiry
        // when an existing session/token was actually rejected by the server.
        window.location.replace('/login' + (hadToken ? '?reason=session_expired' : ''));
        throw new Error('Session expired. Please log in again.');
    }

    let result = null;
    try {
        result = await response.json();
    } catch (e) {
        result = null;
    }

    if (!response.ok) {
        throw new Error((result && result.error) || 'Request failed (' + response.status + ')');
    }

    return result;
}

// Legacy helper kept for compatibility
async function apiCall(endpoint, method = 'GET', data = null) {
    try {
        return await api(endpoint, method, data);
    } catch (e) {
        return { error: e.message };
    }
}

// Toast notifications
function showToast(message, type = 'success', duration = 3500) {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        container.setAttribute('aria-live', 'polite');
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Loading / error / empty state helpers
function showSkeleton(container, count = 3, cols = 5) {
    if (!container) return;
    let html = '';
    for (let i = 0; i < count; i++) {
        html += '<tr>';
        for (let c = 0; c < cols; c++) {
            html += '<td><span class="skeleton skeleton-block" style="min-height:16px"></span></td>';
        }
        html += '</tr>';
    }
    container.innerHTML = html;
}

function showErrorState(container, message, retryFn) {
    if (!container) return;
    const btn = retryFn
        ? `<button class="btn btn-primary btn-sm" onclick="${retryFn}()">Retry</button>`
        : '';
    container.innerHTML = `
        <div class="state-box" role="alert">
            <div class="state-icon">⚠️</div>
            <p>${escapeHtml(message)}</p>
            ${btn}
        </div>`;
}

function showEmptyState(container, message) {
    if (!container) return;
    container.innerHTML = `
        <div class="state-box">
            <div class="state-icon">📭</div>
            <p>${escapeHtml(message)}</p>
        </div>`;
}

// Misc helpers
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function statusBadge(status) {
    const cls = 'status-' + (status || '').replace(/ /g, '_');
    return `<span class="status-badge ${cls}" style="text-transform: capitalize;">${escapeHtml(statusLabel(status))}</span>`;
}

// Human-readable appointment status label
function statusLabel(status) {
    const labels = {
        pending: 'Pending',
        seen: 'Seen',
        accepted: 'Accepted',
        in_progress: 'In Progress',
        completed: 'Completed',
        cancelled: 'Cancelled',
        rejected: 'Rejected',
        follow_up: 'Follow-up'
    };
    return labels[status] || status || 'unknown';
}

// Appointment lifecycle order (for timeline rendering)
const APPT_STATUS_ORDER = ['pending', 'seen', 'accepted', 'in_progress', 'completed'];

// Timeline step metadata
function apptTimelineSteps(a) {
    const steps = [
        { status: 'pending', label: 'Requested', time: a.created_at },
        { status: 'seen', label: 'Viewed by doctor', time: a.seen_at },
        { status: 'accepted', label: 'Accepted', time: a.accepted_at },
        { status: 'in_progress', label: 'In progress', time: a.in_progress_at },
        { status: 'completed', label: 'Completed', time: a.completed_at }
    ];
    if (a.status === 'rejected') {
        steps.push({ status: 'rejected', label: 'Rejected', time: a.rejected_at, extra: a.rejection_reason });
    }
    if (a.status === 'cancelled') {
        steps.push({ status: 'cancelled', label: 'Cancelled', time: a.cancelled_at, extra: a.cancelled_by === 'patient' ? 'by patient' : (a.cancelled_by === 'doctor' ? 'by doctor' : '') });
    }
    return steps;
}

// Render an appointment status timeline
function statusTimeline(a) {
    const idx = APPT_STATUS_ORDER.indexOf(a.status);
    const done = idx < 0 ? APPT_STATUS_ORDER.length : idx;
    const html = apptTimelineSteps(a).map(s => {
        const stepIdx = APPT_STATUS_ORDER.indexOf(s.status);
        const reached = stepIdx >= 0 && stepIdx <= done;
        const active = s.status === a.status;
        return `
            <div class="appt-step ${reached ? 'reached' : ''} ${active ? 'active' : ''}">
                <span class="appt-step-dot" aria-hidden="true"></span>
                <div class="appt-step-body">
                    <strong>${escapeHtml(s.label)}</strong>
                    ${s.time ? `<span class="text-muted appt-step-time">${escapeHtml(formatDateTime(s.time))}</span>` : ''}
                    ${s.extra ? `<span class="appt-step-extra">${escapeHtml(s.extra)}</span>` : ''}
                </div>
            </div>`;
    }).join('');
    return `<div class="appt-timeline" aria-label="Appointment status history">${html}</div>`;
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTime(timeString) {
    if (!timeString) return 'N/A';
    return timeString;
}

function formatDateTime(dateString) {
    if (!dateString) return 'N/A';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

// Escape key closes modals
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(modal => {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        });
    }
});

// Auth check for protected pages
function requireAuth(allowedRoles) {
    const token = getToken();
    const user = getUser();

    if (!token || !user.id) {
        window.location.replace('/login');
        return false;
    }

    if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
        window.location.replace('/login');
        return false;
    }

    return true;
}

// Boot a doctor/admin page: auth check, user display, active nav highlight, mobile toggle
function bootPage(activeKey, allowedRoles) {
    if (!requireAuth(allowedRoles)) return false;
    const user = getUser();

    const userDisplay = document.getElementById('userDisplay');
    if (userDisplay) userDisplay.textContent = user.full_name || 'User';
    syncHeaderAvatar();

    // Initialize i18n system
    if (typeof ShrijalI18n !== 'undefined' && !ShrijalI18n._loaded) {
        ShrijalI18n._loaded = true;
        ShrijalI18n.init({
            onLanguageChange: function(lang) {
                ShrijalI18n.applyLanguageToDOM();
            }
        }).then(function() {
            ShrijalI18n.applyLanguageToDOM();
        });
    }

    const navLinks = document.querySelectorAll('.admin-nav a');
    navLinks.forEach(link => {
        const key = link.getAttribute('data-nav');
        // Doctors get the /doctor/* portal URLs; admins keep /admin/*
        if (user.role === 'doctor' && link.getAttribute('href') && link.getAttribute('href').indexOf('/admin/') === 0) {
            link.setAttribute('href', '/doctor/' + link.getAttribute('href').substring('/admin/'.length));
        }
        if (key === activeKey) {
            link.classList.add('active');
            link.setAttribute('aria-current', 'page');
        } else {
            link.classList.remove('active');
        }
    });

    const toggle = document.querySelector('.admin-nav-toggle');
    const navList = document.querySelector('.admin-nav ul');
    if (toggle && navList) {
        toggle.addEventListener('click', () => {
            toggle.classList.toggle('active');
            navList.classList.toggle('active');
        });
    }

    return true;
}

// Mobile menu toggle (landing page)
document.addEventListener('DOMContentLoaded', function () {
    const mobileToggle = document.getElementById('mobileToggle');
    const mainNav = document.getElementById('mainNav');

    if (mobileToggle && mainNav) {
        mobileToggle.addEventListener('click', function () {
            mobileToggle.classList.toggle('active');
            mainNav.classList.toggle('active');
        });
    }

    // Restore saved theme or system preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }

    // Update theme toggle button text
    const toggle = document.getElementById('themeToggle');
    if (toggle) {
        toggle.innerHTML = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
    }

    // Close modals when clicking outside
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function (e) {
            if (e.target === modal) {
                hideModal(modal.id);
            }
        });
    });
});

// ---------- Profile photo / avatar system ----------

// Initials derived from a full name ("Kajal Bind" -> "KB")
function initialsOf(name) {
    const clean = String(name || '').trim();
    if (!clean) return 'U';
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Cache-busted src for a stored photo path
function avatarSrc(photo) {
    return photo ? ('/' + photo + '?t=' + Date.now()) : '';
}

function avatarInitialsHtml(name, size) {
    size = size || 'md';
    return `<span class="avatar avatar-${size} avatar-initials" role="img" aria-label="${escapeHtml(name || 'User')}">${escapeHtml(initialsOf(name))}</span>`;
}

// Reusable avatar markup. Falls back to initials when no photo exists or the image fails to load.
function avatarHtml(name, photo, size) {
    size = size || 'md';
    const alt = name || 'User';
    if (photo) {
        return `<img src="${avatarSrc(photo)}" alt="${escapeHtml(alt)}" class="avatar avatar-${size} avatar-img" data-size="${size}" data-name="${escapeHtml(alt)}">`;
    }
    return avatarInitialsHtml(name, size);
}

// Image load-failure fallback (capture-phase error listener)
document.addEventListener('error', function (e) {
    const img = e.target;
    if (img && img.classList && img.classList.contains('avatar-img')) {
        img.outerHTML = avatarInitialsHtml(img.getAttribute('data-name') || 'User', img.getAttribute('data-size') || 'md');
    }
}, true);

// Refresh the avatar shown in the portal header
function syncHeaderAvatar() {
    const user = getUser();
    const headerUser = document.querySelector('.admin-user');
    if (!headerUser || !user.id) return;
    let slot = document.getElementById('headerAvatar');
    if (!slot) {
        slot = document.createElement('span');
        slot.id = 'headerAvatar';
        slot.className = 'header-avatar';
        headerUser.insertBefore(slot, headerUser.firstChild);
    }
    slot.innerHTML = avatarHtml(user.full_name, user.photo, 'sm');
}

// Photo manager state
let photoManager = null;
const PM_SIZE = 300;   // crop viewport (px)
const PM_OUT = 400;    // cropped output (px)

// Opens the shared profile-photo manager (upload / crop / remove)
function openPhotoManager(opts) {
    if (!opts || !opts.user) return;
    const role = opts.role || 'user';
    const user = opts.user;
    const endpoint = '/api/' + role + (role === 'admin' ? '/profile/photo' : '/me/photo');

    if (photoManager && photoManager.parentNode) {
        photoManager.parentNode.removeChild(photoManager);
        photoManager = null;
    }

    const modal = document.createElement('div');
    modal.className = 'modal photo-manager-modal';
    modal.id = 'photoManagerModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Profile photo');
    modal.innerHTML = `
        <div class="modal-content pm-content">
            <div class="modal-header">
                <h2>Profile Photo</h2>
                <button type="button" class="modal-close" onclick="closePhotoManager()" aria-label="Close">&times;</button>
            </div>
            <div class="pm-body">
                <div class="pm-current">
                    <div id="pmCurrentAvatar">${avatarHtml(user.full_name, user.photo, 'xl')}</div>
                    <p class="pm-hint">JPG, PNG or WEBP. Maximum 5 MB.</p>
                </div>
                <div class="pm-actions">
                    <button type="button" class="btn btn-primary" id="pmChangeBtn">Change Photo</button>
                    <button type="button" class="btn btn-outline" id="pmRemoveBtn" ${user.photo ? '' : 'disabled'}>Remove Photo</button>
                </div>
                <div id="pmError" class="pm-error" role="alert" hidden></div>
                <input type="file" id="pmFileInput" accept="image/jpeg,image/png,image/webp" hidden>
                <div id="pmCrop" class="pm-crop" hidden>
                    <div class="crop-stage">
                        <div class="crop-viewport" id="pmViewport">
                            <canvas id="pmCanvas" width="400" height="400"></canvas>
                        </div>
                        <div class="crop-zoom">
                            <label for="pmZoom">Zoom</label>
                            <input type="range" id="pmZoom" min="1" max="4" step="0.05" value="1" aria-label="Zoom">
                        </div>
                        <p class="pm-hint">Drag to reposition. Use the slider to zoom.</p>
                    </div>
                    <div class="pm-crop-actions">
                        <button type="button" class="btn btn-outline" id="pmCropCancel">Cancel</button>
                        <button type="button" class="btn btn-primary" id="pmSaveBtn">Save Photo</button>
                    </div>
                </div>
                <div id="pmUploading" class="pm-uploading" hidden><span class="spinner" aria-hidden="true"></span> Uploading...</div>
            </div>
        </div>`;
    document.body.appendChild(modal);
    photoManager = modal;
    photoManager._opts = opts;

    // Close on backdrop click
    modal.addEventListener('click', function (e) {
        if (e.target === modal) closePhotoManager();
    });

    const changeBtn = modal.querySelector('#pmChangeBtn');
    const removeBtn = modal.querySelector('#pmRemoveBtn');
    const fileInput = modal.querySelector('#pmFileInput');

    changeBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files[0]) pmHandleFile(fileInput.files[0]);
    });

    removeBtn.addEventListener('click', pmHandleRemove);

    // Canvas wiring
    modal.querySelector('#pmViewport').addEventListener('pointerdown', pmStartDrag);
    modal.querySelector('#pmZoom').addEventListener('input', function () {
        if (photoManager && photoManager._img) {
            photoManager._zoom = Number(this.value);
            pmDraw();
        }
    });
    modal.querySelector('#pmSaveBtn').addEventListener('click', pmSave);
    modal.querySelector('#pmCropCancel').addEventListener('click', pmCloseCrop);

    showModal('photoManagerModal');

    if (opts.start === 'remove' && !removeBtn.disabled) {
        setTimeout(() => removeBtn.click(), 50);
    }
}

function closePhotoManager() {
    if (photoManager && photoManager.parentNode) {
        photoManager.parentNode.removeChild(photoManager);
        photoManager = null;
    }
}

function pmShowError(message) {
    const box = document.getElementById('pmError');
    if (!box) return;
    box.textContent = message;
    box.hidden = false;
}

function pmHideError() {
    const box = document.getElementById('pmError');
    if (box) box.hidden = true;
}

function pmSetUploading(on) {
    const busy = document.getElementById('pmUploading');
    const changeBtn = document.getElementById('pmChangeBtn');
    const removeBtn = document.getElementById('pmRemoveBtn');
    if (busy) busy.hidden = !on;
    if (changeBtn) changeBtn.disabled = on;
    if (removeBtn) removeBtn.disabled = on;
}

// Validate + load the chosen file into the crop stage
function pmHandleFile(file) {
    pmHideError();
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
        pmShowError('Please upload a JPG, PNG, or WEBP image.');
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        pmShowError('Image size must be less than 5 MB.');
        return;
    }
    const img = new Image();
    img._origType = file.type;
    img.onload = function () {
        if (!photoManager) return;
        photoManager._img = img;
        photoManager._zoom = 1;
        photoManager._dx = 0;
        photoManager._dy = 0;
        document.getElementById('pmCrop').hidden = false;
        pmDraw();
    };
    img.onerror = function () {
        pmShowError('Unable to read this image. Please try another file.');
    };
    img.src = URL.createObjectURL(file);
}

function pmCloseCrop() {
    document.getElementById('pmCrop').hidden = true;
    pmHideError();
    if (photoManager && photoManager._img) {
        URL.revokeObjectURL(photoManager._img.src);
        photoManager._img = null;
    }
}

function pmBaseScale() {
    const img = photoManager._img;
    return PM_SIZE / Math.min(img.naturalWidth, img.naturalHeight);
}

function pmDraw() {
    const img = photoManager._img;
    const canvas = document.getElementById('pmCanvas');
    const scale = pmBaseScale() * photoManager._zoom;
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const maxDx = Math.max(0, (w - PM_SIZE) / 2);
    const maxDy = Math.max(0, (h - PM_SIZE) / 2);
    photoManager._dx = Math.max(-maxDx, Math.min(maxDx, photoManager._dx));
    photoManager._dy = Math.max(-maxDy, Math.min(maxDy, photoManager._dy));
    canvas.style.transform = `translate(calc(-50% + ${photoManager._dx}px), calc(-50% + ${photoManager._dy}px))`;
}

function pmStartDrag(e) {
    if (!photoManager || !photoManager._img) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startDx = photoManager._dx;
    const startDy = photoManager._dy;
    const viewport = document.getElementById('pmViewport');
    viewport.classList.add('dragging');
    viewport.setPointerCapture(e.pointerId);
    function move(ev) {
        photoManager._dx = startDx + (ev.clientX - startX);
        photoManager._dy = startDy + (ev.clientY - startY);
        pmDraw();
    }
    function up(ev) {
        viewport.removeEventListener('pointermove', move);
        viewport.removeEventListener('pointerup', up);
        viewport.removeEventListener('pointercancel', up);
        viewport.classList.remove('dragging');
        try { viewport.releasePointerCapture(ev.pointerId); } catch (err) {}
    }
    viewport.addEventListener('pointermove', move);
    viewport.addEventListener('pointerup', up);
    viewport.addEventListener('pointercancel', up);
}

function pmCropBlob(cb) {
    const img = photoManager._img;
    const scale = pmBaseScale() * photoManager._zoom;
    const sx = -photoManager._dx / scale;
    const sy = -photoManager._dy / scale;
    const sw = PM_SIZE / scale;
    const out = document.createElement('canvas');
    out.width = PM_OUT;
    out.height = PM_OUT;
    out.getContext('2d').drawImage(img, sx, sy, sw, sw, 0, 0, PM_OUT, PM_OUT);
    const mime = img._origType === 'image/png' ? 'image/png' : 'image/jpeg';
    out.toBlob(cb, mime, 0.9);
}

async function pmSave() {
    const btn = document.getElementById('pmSaveBtn');
    const cancelBtn = document.getElementById('pmCropCancel');
    const onUpdated = photoManager && photoManager._opts ? photoManager._opts.onUpdated : null;
    const endpoint = photoManager._opts.endpoint || ('/api/' + photoManager._opts.role + (photoManager._opts.role === 'admin' ? '/profile/photo' : '/me/photo'));
    btn.disabled = true;
    cancelBtn.disabled = true;
    pmHideError();
    pmCropBlob(async function (blob) {
        try {
            pmSetUploading(true);
            const formData = new FormData();
            formData.append('photo', blob, 'photo.jpg');
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + getToken() },
                body: formData
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Upload failed');
            const u = getUser();
            u.photo = data.photo;
            localStorage.setItem('user', JSON.stringify(u));
            syncHeaderAvatar();
            closePhotoManager();
            showToast('Profile photo updated successfully.');
            if (onUpdated) setTimeout(() => onUpdated(data.photo), 0);
        } catch (err) {
            pmSetUploading(false);
            pmShowError(err.message);
            btn.disabled = false;
            cancelBtn.disabled = false;
        }
    });
}

function pmHandleRemove() {
    const btn = document.getElementById('pmRemoveBtn');
    if (btn.getAttribute('data-confirm') !== '1') {
        btn.setAttribute('data-confirm', '1');
        btn.textContent = 'Confirm Remove?';
        btn.classList.add('btn-danger');
        setTimeout(() => {
            btn.setAttribute('data-confirm', '0');
            btn.textContent = 'Remove Photo';
            btn.classList.remove('btn-danger');
        }, 3500);
        return;
    }
    pmHideError();
    pmSetUploading(true);
    const endpoint = photoManager._opts.endpoint || ('/api/' + photoManager._opts.role + (photoManager._opts.role === 'admin' ? '/profile/photo' : '/me/photo'));
    fetch(endpoint, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + getToken() }
    }).then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Remove failed');
        const u = getUser();
        u.photo = null;
        localStorage.setItem('user', JSON.stringify(u));
        syncHeaderAvatar();
        const cb = photoManager && photoManager._opts ? photoManager._opts.onUpdated : null;
        closePhotoManager();
        showToast('Profile photo removed successfully.');
        if (cb) setTimeout(() => cb(null), 0);
    }).catch((err) => {
        pmSetUploading(false);
        pmShowError(err.message);
    });
}