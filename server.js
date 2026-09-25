const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { db, initDatabase } = require('./database/config');

// Set default env vars if not using .env
process.env.PORT = process.env.PORT || 3000;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'doctor_ai_secret_key_2024';
process.env.DB_PATH = process.env.DB_PATH || './database/medical.db';
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

// Admin registration (development/demo mode only, gated by a server-side secret).
// In production (NODE_ENV=production) or when ADMIN_REGISTRATION_SECRET is unset,
// public admin registration is always rejected and admins are created via `npm run create-admin`.
const ADMIN_REGISTRATION_SECRET = process.env.ADMIN_REGISTRATION_SECRET || '';
const ADMIN_REGISTRATION_ENABLED = process.env.NODE_ENV !== 'production' && ADMIN_REGISTRATION_SECRET.length > 0;

// Timing-safe comparison of the provided admin registration key against the env secret
function adminKeyMatches(providedKey) {
    if (!ADMIN_REGISTRATION_SECRET || typeof providedKey !== 'string' || !providedKey) return false;
    const a = crypto.createHash('sha256').update(providedKey).digest();
    const b = crypto.createHash('sha256').update(ADMIN_REGISTRATION_SECRET).digest();
    return crypto.timingSafeEqual(a, b);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/locales', express.static(path.join(__dirname, 'locales')));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use('/favicon.png', express.static(path.join(__dirname, 'favicon.png')));
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, 'favicon.png')));

// Serve pages as static routes
app.use('/pages', express.static(path.join(__dirname, 'pages')));
app.get('/pages/login.html', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'login.html')));
app.get('/pages/landing.html', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'landing.html')));

// Prevent browser/back-button caching of protected pages
app.use(['/admin', '/patient', '/doctor'], (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    next();
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'landing.html')));
app.get('/login', (req, res) => {
    const token = readToken(req);
    if (token) {
        jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
            if (!err) {
                let target = '/patient/dashboard';
                if (user.role === 'admin') target = '/admin/dashboard';
                else if (user.role === 'doctor') target = '/doctor/dashboard';
                else if (user.role === 'hospital_admin') target = '/hospital/dashboard';
                else if (user.role === 'staff') target = '/patient/dashboard';
                return res.redirect(target);
            }
            res.sendFile(path.join(__dirname, 'pages', 'login.html'));
        });
        return;
    }
    res.sendFile(path.join(__dirname, 'pages', 'login.html'));
});
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'login.html')));
app.get('/forgot-password', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'forgot-password.html')));
app.get('/reset-password', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'reset-password.html')));
app.get('/admin/login', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'login.html')));

// Serve admin pages (protected: admin role only)
app.get('/admin/dashboard', protectPage(['admin']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'admin', 'dashboard.html')));
app.get('/admin/doctors', protectPage(['admin']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'admin', 'doctors.html')));
app.get('/admin/patients', protectPage(['admin']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'admin', 'patients.html')));
// Legacy /admin/patients/:id links (old doctor portal): redirect doctors to their own portal, admins to the patients page
app.get('/admin/patients/:id', protectPage(['doctor', 'admin']), (req, res) => {
    if (req.user.role === 'doctor') return res.redirect('/doctor/patients/' + req.params.id);
    return res.redirect('/admin/patients');
});
app.get('/admin/appointments', protectPage(['admin']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'admin', 'appointments.html')));
app.get('/admin/consultations', protectPage(['admin']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'admin', 'consultations.html')));
app.get('/admin/messages', protectPage(['admin']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'admin', 'messages.html')));
app.get('/admin/reports', protectPage(['admin']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'admin', 'reports.html')));
app.get('/admin/profile', protectPage(['admin']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'admin', 'profile.html')));
app.get('/admin/settings', protectPage(['admin']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'admin', 'settings.html')));
app.get('/admin/audit-logs', protectPage(['admin']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'admin', 'audit-logs.html')));
app.get('/admin/ai-assistant', protectPage(['admin']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'admin', 'ai-assistant.html')));
app.get('/admin/knowledge-base', protectPage(['admin']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'admin', 'knowledge-base.html')));

// Serve doctor portal pages (protected)
app.get('/doctor/dashboard', protectPage(['doctor']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'portal', 'doctor', 'dashboard.html')));
app.get('/doctor/profile', protectPage(['doctor']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'portal', 'doctor', 'profile.html')));
app.get('/doctor/settings', protectPage(['doctor']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'portal', 'doctor', 'settings.html')));
app.get('/doctor/patients', protectPage(['doctor']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'portal', 'doctor', 'patients.html')));
app.get('/doctor/patients/:patientId', protectPage(['doctor']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'portal', 'doctor', 'patient-detail.html')));
app.get('/doctor/appointments', protectPage(['doctor']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'doctor', 'appointments.html')));
app.get('/doctor/consultations', protectPage(['doctor']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'doctor', 'consultations.html')));
app.get('/doctor/messages', protectPage(['doctor']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'doctor', 'messages.html')));
app.get('/doctor/reports', protectPage(['doctor']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'doctor', 'reports.html')));
app.get('/doctor/ai-assistant', protectPage(['doctor']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'doctor', 'ai-assistant.html')));

// Serve patient pages (protected)
app.get('/patient/dashboard', protectPage(['patient']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'patient', 'dashboard.html')));
app.get('/patient/consultations', protectPage(['patient']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'patient', 'consultations.html')));
app.get('/patient/reports', protectPage(['patient']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'patient', 'reports.html')));
app.get('/patient/prescriptions', protectPage(['patient']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'patient', 'prescriptions.html')));
app.get('/patient/messages', protectPage(['patient']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'patient', 'messages.html')));
app.get('/patient/profile', protectPage(['patient']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'patient', 'profile.html')));
app.get('/patient/settings', protectPage(['patient']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'patient', 'settings.html')));
app.get('/patient/appointments', protectPage(['patient']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'patient', 'appointments.html')));
app.get('/patient/doctors', protectPage(['patient']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'patient', 'doctors.html')));
app.get('/patient/ai-assistant', protectPage(['patient']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'patient', 'ai-assistant.html')));

// Serve hospital pages (protected)
app.get('/hospital/dashboard', protectPage(['hospital_admin']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'hospital', 'dashboard.html')));
app.get('/hospital/doctors', protectPage(['hospital_admin']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'hospital', 'doctors.html')));
app.get('/hospital/join-requests', protectPage(['hospital_admin']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'hospital', 'join-requests.html')));
app.get('/hospital/departments', protectPage(['hospital_admin']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'hospital', 'departments.html')));
app.get('/hospital/patients', protectPage(['hospital_admin']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'hospital', 'patients.html')));
app.get('/hospital/staff', protectPage(['hospital_admin']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'hospital', 'staff.html')));
app.get('/hospital/profile', protectPage(['hospital_admin']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'hospital', 'profile.html')));
app.get('/hospital/notifications', protectPage(['hospital_admin']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'hospital', 'notifications.html')));
app.get('/hospital/settings', protectPage(['hospital_admin']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'hospital', 'settings.html')));

// Hospital auth pages
app.get('/hospital/register', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'hospital-register.html')));
app.get('/hospital/login', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'hospital-login.html')));

// Doctor join hospital page
app.get('/doctor/join-hospital', protectPage(['doctor']), (req, res) => res.sendFile(path.join(__dirname, 'pages', 'doctor', 'join-hospital.html')));

// File upload storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        cb(null, true);
    }
});

// Profile photo upload storage (reused by admin / doctor / patient photo endpoints)
const uploadsDir = path.join(__dirname, 'uploads');
const profileImagesDir = path.join(uploadsDir, 'profile-images');
fs.mkdirSync(profileImagesDir, { recursive: true });

const photoStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, profileImagesDir),
    filename: (req, file, cb) => {
        const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
        cb(null, req.user.id + '_' + Date.now() + '_' + Math.round(Math.random() * 1e9) + ext);
    }
});

const photoUpload = multer({
    storage: photoStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowed.includes(file.mimetype)) return cb(null, true);
        const err = new Error('Please upload a JPG, PNG, or WEBP image.');
        err.status = 400;
        cb(err);
    }
});

// Run the photo upload middleware and convert multer errors into JSON responses
function handlePhotoUpload(req, res, next) {
    photoUpload.single('photo')(req, res, (err) => {
        if (err) {
            const status = err.status || 400;
            const message = err.code === 'LIMIT_FILE_SIZE'
                ? 'Image size must be less than 5 MB.'
                : (err.message || 'Unable to upload profile photo. Please try again.');
            return res.status(status).json({ error: message });
        }
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        next();
    });
}

// Delete a stored profile photo file (only paths inside uploads/)
function clearStoredPhoto(photoPath) {
    if (!photoPath || typeof photoPath !== 'string') return;
    const absolute = path.resolve(__dirname, photoPath);
    if (!absolute.startsWith(path.resolve(uploadsDir))) return;
    fs.unlink(absolute, () => {});
}

// Auth middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        db.get('SELECT id, role, accountStatus FROM users WHERE id = ?', [user.id], (e2, row) => {
            if (e2) return res.status(500).json({ error: 'Server error' });
            if (!row) return res.status(401).json({ error: 'Invalid token' });
            if (row.accountStatus !== 'active') {
                return res.status(403).json({ error: ACCOUNT_STATUS_MESSAGES[row.accountStatus] || 'Your account is not active. Please contact the administrator.' });
            }
            // Role always comes from the verified database row, never from the token
            req.user = { id: row.id, role: row.role, username: user.username, accountStatus: row.accountStatus };
            next();
        });
    });
}

function requireRole(role) {
    return (req, res, next) => {
        if (req.user.role !== role) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
}

// Minimal cookie parser (no extra dependency needed)
function getCookies(req) {
    const cookies = {};
    const header = req.headers.cookie;
    if (header) {
        header.split(';').forEach((pair) => {
            const idx = pair.indexOf('=');
            if (idx > -1) {
                const key = pair.slice(0, idx).trim();
                const val = pair.slice(idx + 1).trim();
                try { cookies[key] = decodeURIComponent(val); } catch (e) { cookies[key] = val; }
            }
        });
    }
    return cookies;
}

function readToken(req) {
    const cookies = getCookies(req);
    if (cookies.token) return cookies.token;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.split(' ')[1];
    }
    return null;
}

// Protect full page routes: redirect to /login when not authenticated (also checks account status)
function protectPage(allowedRoles) {
    return (req, res, next) => {
        const token = readToken(req);
        if (!token) return res.redirect('/login');
        jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
            // A token WAS supplied but is invalid/expired -> genuine session expiry.
            if (err) return res.redirect('/login?reason=session_expired');
            db.get('SELECT role, accountStatus FROM users WHERE id = ?', [user.id], (e2, row) => {
                if (e2 || !row) return res.redirect('/login?reason=session_expired');
                if (row.accountStatus !== 'active') return res.redirect('/login');
                if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(row.role)) {
                    const roleRedirect = {
                        patient: '/patient/dashboard',
                        doctor: '/doctor/dashboard',
                        admin: '/admin/dashboard',
                        hospital_admin: '/hospital/dashboard',
                        staff: '/patient/dashboard'
                    };
                    return res.redirect(roleRedirect[row.role] || '/login');
                }
                req.user = { id: user.id, role: row.role, username: user.username, accountStatus: row.accountStatus };
                next();
            });
        });
    };
}

const TOKEN_COOKIE_OPTIONS = {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/'
};

// User-facing message for each non-active account status (used by login, auth
// middleware and page protection). Only 'active' accounts may use the platform.
const ACCOUNT_STATUS_MESSAGES = {
    blocked: 'Your account has been blocked. Please contact the administrator.',
    deactivated: 'Your account is currently deactivated. Please contact the administrator.',
    deleted: 'This account is no longer available.'
};
const NON_ACTIVE_STATUSES = Object.keys(ACCOUNT_STATUS_MESSAGES);

// Log audit action
function logAction(userId, action, tableName, recordId, details, ip) {
    db.run(
        'INSERT INTO audit_logs (user_id, action, table_name, record_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, action, tableName, recordId, JSON.stringify(details), ip]
    );
}

// Initialize database
initDatabase();

// ========== AUTH ROUTES ==========

// Password policy: minimum 8 chars, uppercase, lowercase, number
function passwordPolicyError(pw) {
    const s = String(pw || '');
    if (s.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(s)) return 'Password must contain at least one uppercase letter';
    if (!/[a-z]/.test(s)) return 'Password must contain at least one lowercase letter';
    if (!/\d/.test(s)) return 'Password must contain at least one number';
    return null;
}

// Helper function to register a user
async function registerUserHandler(req, res) {
    const {
        username, email, password, role = 'patient', full_name, phone, specialty,
        date_of_birth, gender, address, emergency_contact,
        qualification, registration_number, experience_years, hospital, bio, languages, consultation_fee, availability
    } = req.body;

    if (!username || !email || !password || !full_name) {
        return res.status(400).json({ error: 'Missing required fields: username, email, password, and full_name are required' });
    }

    const normalizedRole = role.toLowerCase();
    if (!['doctor', 'patient', 'admin'].includes(normalizedRole)) {
        return res.status(400).json({ error: 'Invalid role. Role must be doctor or patient' });
    }
    if (normalizedRole === 'admin') {
        if (!ADMIN_REGISTRATION_ENABLED) {
            return res.status(403).json({ error: 'Admin accounts cannot be created through public registration.' });
        }
        if (!adminKeyMatches(req.body.adminRegistrationKey)) {
            return res.status(403).json({ error: 'Invalid administrator registration key.' });
        }
    }

    const pwdErr = passwordPolicyError(password);
    if (pwdErr) {
        return res.status(400).json({ error: pwdErr });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        db.run(
            'INSERT INTO users (username, email, password, role, full_name, phone, specialty) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [username, email, hashedPassword, normalizedRole, full_name, phone || null, specialty || null],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(409).json({ error: 'Username or email already exists' });
                    }
                    return res.status(400).json({ error: 'Registration failed. Username or email already exists' });
                }

                const userId = this.lastID;

                const finishRegistration = () => {
                    logAction(userId, 'CREATE', 'users', userId, { username, email, role: normalizedRole }, req.ip);

                    const token = jwt.sign(
                        { id: userId, role: normalizedRole, username },
                        process.env.JWT_SECRET,
                        { expiresIn: '24h' }
                    );

                    res.cookie('token', token, TOKEN_COOKIE_OPTIONS);

                    const safeUser = {
                        id: userId,
                        username,
                        email,
                        role: normalizedRole,
                        full_name,
                        phone: phone || null,
                        specialty: specialty || null,
                        photo: null,
                        accountStatus: 'active',
                        preferredLanguage: 'en',
                        preferredLocale: 'en-IN'
                    };

                    res.status(201).json({
                        success: true,
                        message: 'User registered successfully',
                        token,
                        user: safeUser
                    });
                };

                if (normalizedRole === 'patient') {
                    db.run(
                        'INSERT INTO patients (user_id, date_of_birth, gender, address, emergency_contact) VALUES (?, ?, ?, ?, ?)',
                        [userId, date_of_birth || null, gender || null, address || null, emergency_contact || null],
                        function() { finishRegistration(); }
                    );
                } else if (normalizedRole === 'doctor') {
                    const dpInsert = () => {
                        db.run(
                            `INSERT INTO doctor_profiles (user_id, qualification, registration_number, experience_years, hospital, bio, languages, consultation_fee, availability, verified)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
                            [
                                userId,
                                qualification || null,
                                registration_number || null,
                                experience_years ? Number(experience_years) : null,
                                hospital || null,
                                bio || null,
                                languages || null,
                                consultation_fee ? Number(consultation_fee) : null,
                                availability || null
                            ],
                            function() { finishRegistration(); }
                        );
                    };
                    // Keep existing behaviour: doctors also get a patients row
                    db.run('INSERT INTO patients (user_id) VALUES (?)', [userId], () => dpInsert());
                } else {
                    finishRegistration();
                }
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Server error during registration' });
    }
}

// Unified public registration endpoint
app.post('/api/auth/register', registerUserHandler);

// Public legacy patient & doctor registration endpoints
app.post('/api/auth/register/patient', (req, res) => {
    req.body.role = 'patient';
    registerUserHandler(req, res);
});

app.post('/api/auth/register/doctor', (req, res) => {
    req.body.role = 'doctor';
    registerUserHandler(req, res);
});

// Public auth config: lets the frontend show/hide the Admin registration option.
// Never exposes the registration secret itself.
app.get('/api/auth/config', (req, res) => {
    res.json({
        adminRegistration: ADMIN_REGISTRATION_ENABLED,
        environment: process.env.NODE_ENV === 'production' ? 'production' : 'development'
    });
});

// Login
app.post('/api/auth/login', (req, res) => {
    const { username, password, role: requestedRole } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    const validRoles = ['patient', 'doctor', 'admin', 'hospital_admin', 'staff'];
    if (requestedRole && !validRoles.includes(requestedRole)) {
        return res.status(400).json({ error: 'Invalid role' });
    }

    db.get(
        'SELECT * FROM users WHERE username = ? OR email = ? OR originalUsername = ? OR originalEmail = ?',
        [username, username, username, username],
        async (err, user) => {
            if (err || !user) {
                return res.status(401).json({ error: 'No user found' });
            }

            const validPassword = await bcrypt.compare(password, user.password);

            if (!validPassword) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            if (user.accountStatus !== 'active') {
                return res.status(403).json({ error: ACCOUNT_STATUS_MESSAGES[user.accountStatus] || 'Your account is not active. Please contact the administrator.' });
            }

            if (requestedRole && user.role !== requestedRole) {
                return res.status(401).json({ error: 'No user found' });
            }

            const token = jwt.sign(
                { id: user.id, role: user.role, username: user.username },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.cookie('token', token, TOKEN_COOKIE_OPTIONS);

            db.run('UPDATE users SET lastLoginAt = ? WHERE id = ?', [new Date().toISOString(), user.id]);

            logAction(user.id, 'LOGIN', 'users', user.id, {}, req.ip);

            const respondWithUser = (extraData) => {
                res.json({
                    success: true,
                    message: 'Login successful',
                    token,
                    user: {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        role: user.role,
                        full_name: user.full_name,
                        phone: user.phone,
                        specialty: user.specialty,
                        photo: user.photo || null,
                        accountStatus: user.accountStatus || 'active',
                        lastLoginAt: user.lastLoginAt || null,
                        preferredLanguage: user.preferredLanguage || 'en',
                        preferredLocale: user.preferredLocale || 'en-IN'
                    },
                    ...extraData
                });
            };

            if (user.role === 'hospital_admin') {
                db.get(
                    'SELECT h.* FROM hospitals h JOIN hospital_admins ha ON h.id = ha.hospital_id WHERE ha.user_id = ?',
                    [user.id],
                    (err2, hospital) => {
                        respondWithUser({ hospital: hospital || null });
                    }
                );
            } else {
                db.get(
                    'SELECT * FROM patients WHERE user_id = ?',
                    [user.id],
                    (err, patient) => {
                        respondWithUser({ patient_info: patient || null });
                    }
                );
            }
        }
    );
});

// Public forgot password: generates a reset token (stored hashed, 1h expiry)
app.post('/api/auth/forgot-password', (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Please enter your email or username.' });
    }
    const genericMessage = 'If an account exists with that email, reset instructions have been sent.';
    db.get('SELECT id FROM users WHERE email = ? OR username = ?', [email, email], (err, user) => {
        if (err || !user) {
            return res.json({ success: true, message: genericMessage });
        }
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        db.run(
            'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
            [user.id, tokenHash, expiresAt],
            (e2) => {
                if (e2) {
                    return res.status(500).json({ error: 'Unable to process the request. Please try again.' });
                }
                logAction(user.id, 'REQUEST_PASSWORD_RESET', 'users', user.id, {}, req.ip);
                res.json({
                    success: true,
                    message: genericMessage,
                    // Development convenience: no mail service is configured, so the reset token is returned
                    // directly. In production this token must be sent by email instead.
                    dev_reset_token: token
                });
            }
        );
    });
});

// Public reset password: validates the token, then updates the password
app.post('/api/auth/reset-password', (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
        return res.status(400).json({ error: 'Token and new password are required' });
    }
    const pwdErr = passwordPolicyError(newPassword);
    if (pwdErr) {
        return res.status(400).json({ error: pwdErr });
    }
    const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
    db.get(
        'SELECT user_id, expires_at FROM password_resets WHERE token_hash = ? AND used = 0',
        [tokenHash],
        (err, row) => {
            if (err) return res.status(500).json({ error: 'Unable to process the request. Please try again.' });
            if (!row) return res.status(400).json({ error: 'This reset link is invalid or has already been used.' });
            if (new Date(row.expires_at) < new Date()) {
                return res.status(400).json({ error: 'This reset link has expired. Please request a new one.' });
            }
            const hashed = bcrypt.hashSync(newPassword, 10);
            db.run('UPDATE users SET password = ? WHERE id = ?', [hashed, row.user_id], (e2) => {
                if (e2) return res.status(500).json({ error: 'Unable to process the request. Please try again.' });
                db.run('UPDATE password_resets SET used = 1 WHERE token_hash = ?', [tokenHash], () => {
                    db.run('DELETE FROM password_resets WHERE user_id = ? AND used = 1', [row.user_id], () => {});
                    logAction(row.user_id, 'RESET_PASSWORD', 'users', row.user_id, {}, req.ip);
                    res.json({ success: true, message: 'Password has been reset successfully. You can now sign in.' });
                });
            });
        }
    );
});

// Public OTP verification endpoint
app.post('/api/auth/verify-otp', (req, res) => {
    const { otp } = req.body;
    if (!otp) {
        return res.status(400).json({ error: 'OTP is required' });
    }
    res.json({ success: true, message: 'OTP verified successfully.' });
});

// Protected: Get current user (with role-specific profile)
app.get('/api/auth/me', authenticateToken, (req, res) => {
    db.get(
        'SELECT id, username, email, role, full_name, phone, specialty, photo, accountStatus, lastLoginAt, preferredLanguage, preferredLocale FROM users WHERE id = ?',
        [req.user.id],
        (err, user) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            if (!user) return res.status(404).json({ error: 'User not found' });
            const respond = (extra) => res.json(Object.assign({ user }, extra || {}));
            if (user.role === 'doctor') {
                db.get('SELECT * FROM doctor_profiles WHERE user_id = ?', [user.id], (e2, dp) => {
                    if (e2) return respond();
                    respond({ doctor_profile: dp || null });
                });
            } else if (user.role === 'patient') {
                db.get('SELECT * FROM patients WHERE user_id = ?', [user.id], (e2, pt) => {
                    if (e2) return respond();
                    respond({ patient: pt || null });
                });
            } else if (user.role === 'hospital_admin') {
                db.get('SELECT h.* FROM hospitals h JOIN hospital_admins ha ON h.id = ha.hospital_id WHERE ha.user_id = ?', [user.id], (e2, hospital) => {
                    if (e2) return respond();
                    respond({ hospital: hospital || null });
                });
            } else {
                respond();
            }
        }
    );
});

// Protected: Logout (clears the session cookie)
app.post('/api/auth/logout', authenticateToken, (req, res) => {
    res.clearCookie('token', { path: '/' });
    logAction(req.user.id, 'LOGOUT', 'users', req.user.id, {}, req.ip);
    res.json({ success: true, message: 'Logged out successfully' });
});

const SUPPORTED_LANGUAGES = ['en','hi','bn','mr','ta','te','gu','kn','ml','pa','or','as','ur','ne'];
const SUPPORTED_LOCALES = {
    'en': 'en-IN', 'hi': 'hi-IN', 'bn': 'bn-IN', 'mr': 'mr-IN',
    'ta': 'ta-IN', 'te': 'te-IN', 'gu': 'gu-IN', 'kn': 'kn-IN',
    'ml': 'ml-IN', 'pa': 'pa-IN', 'or': 'or-IN', 'as': 'as-IN',
    'ur': 'ur-IN', 'ne': 'ne-IN'
};

// Protected: Update preferred language
app.put('/api/user/language', authenticateToken, (req, res) => {
    const { preferredLanguage } = req.body;
    if (!preferredLanguage || !SUPPORTED_LANGUAGES.includes(preferredLanguage)) {
        return res.status(400).json({ error: 'Unsupported language. Supported: ' + SUPPORTED_LANGUAGES.join(', ') });
    }
    const locale = SUPPORTED_LOCALES[preferredLanguage] || 'en-IN';
    db.run('UPDATE users SET preferredLanguage = ?, preferredLocale = ? WHERE id = ?',
        [preferredLanguage, locale, req.user.id], (err) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        logAction(req.user.id, 'UPDATE', 'users', req.user.id, { preferredLanguage, preferredLocale: locale }, req.ip);
        res.json({ message: 'Language updated successfully', preferredLanguage, preferredLocale: locale });
    });
});

// Protected: Get supported languages
app.get('/api/languages', (req, res) => {
    res.json({
        supported: SUPPORTED_LANGUAGES,
        locales: SUPPORTED_LOCALES,
        names: {
            'en': 'English', 'hi': '\u0939\u093F\u0928\u094D\u0926\u0940', 'bn': '\u09AC\u09BE\u0982\u09B2\u09BE',
            'mr': '\u092E\u0930\u093E\u0920\u0940', 'ta': '\u0A4D\u0A35\u0A3F\u0A34\u0BCD', 'te': '\u0C24\u0C46\u0C32\u0C41\u0C17\u0C41',
            'gu': '\u0A97\u0AC1\u0A9C\u0AB0\u0ABE\u0AA4\u0AC0', 'kn': '\u0C95\u0CA8\u0CCD\u0CA8\u0CA1',
            'ml': '\u0D2E\u0D32\u0D2F\u0D3E\u0D33\u0D02', 'pa': '\u0A2A\u0A70\u0A1C\u0A3E\u0A2C\u0A40',
            'or': '\u0B13\u0B21\u0B3C\u0BFF\u0B06', 'as': '\u0905\u0938\u092E\u0940\u092F\u093E\u0935\u093E\u0939\u093F',
            'ur': '\u0627\u0631\u062F\u0648', 'ne': '\u0928\u0947\u092A\u093E\u0932\u0940'
        }
    });
});

// Protected: Change own password
app.post('/api/auth/change-password', authenticateToken, (req, res) => {
    const bcrypt = require('bcryptjs');
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
        return res.status(400).json({ error: 'Current and new password are required' });
    }
    if (String(new_password).length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    db.get('SELECT password FROM users WHERE id = ?', [req.user.id], (err, row) => {
        if (err || !row) return res.status(500).json({ error: 'Server error' });
        if (!bcrypt.compareSync(current_password, row.password)) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }
        const hashed = bcrypt.hashSync(new_password, 10);
        db.run('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id], (e2) => {
            if (e2) return res.status(500).json({ error: 'Server error' });
            logAction(req.user.id, 'UPDATE', 'users', req.user.id, { action: 'change_password' }, req.ip);
            res.json({ success: true, message: 'Password changed successfully' });
        });
    });
});

// Protected: List doctors (public professional info, for patients)
app.get('/api/doctors', authenticateToken, (req, res) => {
    db.all(
        `SELECT u.id, u.full_name, u.specialty, u.phone, u.email, u.photo,
                dp.qualification, dp.experience_years, dp.hospital, dp.bio, dp.languages,
                dp.consultation_fee, dp.availability, dp.verified,
                (SELECT AVG(rating) FROM reviews WHERE doctor_id = u.id) AS rating,
                (SELECT COUNT(*) FROM reviews WHERE doctor_id = u.id) AS review_count
         FROM users u
         LEFT JOIN doctor_profiles dp ON dp.user_id = u.id
         WHERE u.role = 'doctor' ORDER BY u.full_name`,
        (err, doctors) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            res.json(doctors);
        }
    );
});

// ========== PATIENT ROUTES ==========

// Authorization helper:
//  - admin: any patient
//  - patient: only their own record
//  - doctor: only patients with a real relationship (consultation/appointment with doctor_id = this doctor)
function canAccessPatient(user, userId, cb) {
    if (user.role === 'admin') return cb(null, true);
    if (user.role === 'patient') return cb(null, String(user.id) === String(userId));
    if (user.role === 'doctor') {
        db.get(
            `SELECT 1 FROM consultations c JOIN patients p ON c.patient_id = p.id
             WHERE c.doctor_id = ? AND p.user_id = ? LIMIT 1`,
            [user.id, userId],
            (err, row) => {
                if (err) return cb(err, false);
                cb(null, !!row);
            }
        );
        return;
    }
    cb(null, false);
}

// Get all patients (doctor: only related patients; admin: all)
app.get('/api/patients', authenticateToken, requireRole('doctor'), (req, res) => {
    const isAdmin = req.user.role === 'admin';
    const where = isAdmin
        ? 'WHERE 1=1'
        : `WHERE p.user_id IN (
                SELECT DISTINCT pu.user_id FROM consultations c
                JOIN patients pu ON c.patient_id = pu.id
                WHERE c.doctor_id = ?
           )`;
    const params = isAdmin ? [] : [req.user.id];
    db.all(`
        SELECT p.*, u.username, u.email, u.full_name, u.phone
        FROM patients p 
        JOIN users u ON p.user_id = u.id
        ${where}
        ORDER BY u.full_name
    `, params, (err, patients) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        res.json(patients);
    });
});

// ========== PATIENT ME APIs (identity always from the verified token) ==========

// Get logged-in patient's own profile
app.get('/api/patients/me', authenticateToken, requireRole('patient'), (req, res) => {
    db.get(
        `SELECT p.*, u.username, u.email, u.full_name, u.phone, u.photo
         FROM patients p JOIN users u ON p.user_id = u.id WHERE p.user_id = ?`,
        [req.user.id],
        (err, patient) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            if (!patient) return res.status(404).json({ error: 'Patient profile not found' });
            res.json({ patient });
        }
    );
});

// Update logged-in patient's own profile (whitelist; identity from token, never from body)
app.put('/api/patients/me', authenticateToken, requireRole('patient'), (req, res) => {
    const uid = req.user.id;
    const allowed = ['date_of_birth', 'gender', 'address', 'emergency_contact', 'blood_type', 'height', 'weight', 'allergies', 'chronic_conditions', 'current_medications'];
    const clean = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) clean[k] = req.body[k]; });
    if (Object.keys(clean).length === 0) {
        return res.status(400).json({ error: 'No editable fields provided' });
    }
    const setSql = Object.keys(clean).map(k => `${k} = ?`).join(', ');
    const values = Object.values(clean);
    values.push(uid);
    db.run(`UPDATE patients SET ${setSql} WHERE user_id = ?`, values, (err) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        logAction(uid, 'UPDATE', 'patients', uid, clean, req.ip);
        res.json({ message: 'Profile updated successfully' });
    });
});

// Upload patient profile photo
app.post('/api/patients/me/photo', authenticateToken, requireRole('patient'), handlePhotoUpload, (req, res) => {
    const photoPath = 'uploads/profile-images/' + req.file.filename;
    db.get('SELECT photo FROM users WHERE id = ?', [req.user.id], (err, row) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        db.run('UPDATE users SET photo = ? WHERE id = ?', [photoPath, req.user.id], (err2) => {
            if (err2) return res.status(500).json({ error: 'Server error' });
            if (row && row.photo && row.photo !== photoPath) clearStoredPhoto(row.photo);
            logAction(req.user.id, 'UPDATE', 'users', req.user.id, { action: 'upload_photo' }, req.ip);
            res.json({ message: 'Profile photo updated successfully.', photo: photoPath });
        });
    });
});

// Remove patient profile photo
app.delete('/api/patients/me/photo', authenticateToken, requireRole('patient'), (req, res) => {
    db.get('SELECT photo FROM users WHERE id = ?', [req.user.id], (err, row) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        db.run('UPDATE users SET photo = NULL WHERE id = ?', [req.user.id], (err2) => {
            if (err2) return res.status(500).json({ error: 'Server error' });
            if (row && row.photo) clearStoredPhoto(row.photo);
            logAction(req.user.id, 'UPDATE', 'users', req.user.id, { action: 'remove_photo' }, req.ip);
            res.json({ message: 'Profile photo removed successfully.' });
        });
    });
});

// Patient: own appointments
app.get('/api/patients/me/appointments', authenticateToken, requireRole('patient'), (req, res) => {
    db.all(
        `SELECT c.*, pu.id as patient_user_id, pu.full_name as patient_name, pu.photo as patient_photo, pu.phone as patient_phone, pu.email as patient_email,
                u.full_name as doctor_name, u.specialty, u.photo as doctor_photo
         FROM consultations c
         JOIN users u ON c.doctor_id = u.id
         JOIN patients p ON c.patient_id = p.id
         JOIN users pu ON p.user_id = pu.id
         WHERE c.patient_id = (SELECT id FROM patients WHERE user_id = ?)
         ORDER BY c.date DESC, c.appointment_time DESC`,
        [req.user.id],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            const result = (rows || []).map(a => serializeAppointment({ ...a, patient_table_id: a.patient_id }));
            res.json(result);
        }
    );
});

// Patient: own consultations
app.get('/api/patients/me/consultations', authenticateToken, requireRole('patient'), (req, res) => {
    db.all(
        `SELECT c.*, u.full_name as doctor_name, u.specialty
         FROM consultations c
         JOIN users u ON c.doctor_id = u.id
         WHERE c.patient_id = (SELECT id FROM patients WHERE user_id = ?)
         ORDER BY c.created_at DESC`,
        [req.user.id],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            const result = (rows || []).map(c => ({
                ...c,
                vital_signs: c.vital_signs ? JSON.parse(c.vital_signs) : {},
                ai_suggestions: c.ai_suggestions ? JSON.parse(c.ai_suggestions) : []
            }));
            res.json(result);
        }
    );
});

// Patient: own reports
app.get('/api/patients/me/reports', authenticateToken, requireRole('patient'), (req, res) => {
    db.all(
        `SELECT r.*, u.full_name as doctor_name
         FROM reports r
         JOIN patients p ON r.patient_id = p.id
         LEFT JOIN users u ON r.uploaded_by = u.id
         WHERE p.user_id = ?
         ORDER BY r.created_at DESC`,
        [req.user.id],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            res.json(rows);
        }
    );
});

// Patient: own prescriptions
app.get('/api/patients/me/prescriptions', authenticateToken, requireRole('patient'), (req, res) => {
    db.all(
        `SELECT pl.* FROM prescription_logs pl
         JOIN patients p ON pl.patient_id = p.id
         WHERE p.user_id = ?
         ORDER BY pl.created_at DESC`,
        [req.user.id],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            res.json(rows);
        }
    );
});

// Get patient by ID
app.get('/api/patients/:id', authenticateToken, (req, res) => {
    const patientId = req.params.id;

    canAccessPatient(req.user, patientId, (err, allowed) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!allowed) return res.status(403).json({ error: 'Insufficient permissions' });

        db.get(
            `SELECT p.*, u.username, u.email, u.full_name, u.phone FROM patients p 
             JOIN users u ON p.user_id = u.id WHERE p.user_id = ?`,
            [patientId],
            (e2, patient) => {
                if (e2) return res.status(500).json({ error: 'Server error' });
                if (!patient) return res.status(404).json({ error: 'Patient not found' });
                res.json(patient);
            }
        );
    });
});

// Get patient full profile (history, medication, etc)
app.get('/api/patients/:id/profile', authenticateToken, (req, res) => {
    const userId = req.params.id;

    canAccessPatient(req.user, userId, (err, allowed) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!allowed) return res.status(403).json({ error: 'Insufficient permissions' });

        db.get(
        `SELECT p.*, u.username, u.email, u.full_name, u.phone FROM patients p 
         JOIN users u ON p.user_id = u.id WHERE p.user_id = ?`,
        [userId],
        (err, patient) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            if (!patient) return res.status(404).json({ error: 'Patient not found' });
            
            db.all(
                'SELECT * FROM medical_history WHERE patient_id = ?',
                [patient.id],
                (err, history) => {
                    db.all(
                        'SELECT * FROM consultations WHERE patient_id = ? ORDER BY created_at DESC',
                        [patient.id],
                        (err, consultations) => {
                            db.all(
                                'SELECT * FROM reports WHERE patient_id = ? ORDER BY created_at DESC',
                                [patient.id],
                                (err, reports) => {
                                    db.all(
                                        'SELECT * FROM prescription_logs WHERE patient_id = ?',
                                        [patient.id],
                                        (err, prescriptions) => {
                                            res.json({
                                                patient,
                                                medical_history: history || [],
                                                consultations: consultations || [],
                                                reports: reports || [],
                                                prescriptions: prescriptions || []
                                            });
                                        }
                                    );
                                }
                            );
                        }
                    );
                }
            );
        }
        );
    });
});

// Update patient info
app.put('/api/patients/:id', authenticateToken, (req, res) => {
    const userId = req.params.id;

    canAccessPatient(req.user, userId, (err, allowed) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!allowed) return res.status(403).json({ error: 'Insufficient permissions' });

        const { allergies, chronic_conditions, current_medications, height, weight, emergency_contact, blood_type } = req.body;

        db.run(
            `UPDATE patients SET allergies = ?, chronic_conditions = ?, current_medications = ?, 
             height = ?, weight = ?, emergency_contact = ?, blood_type = ? WHERE user_id = ?`,
            [allergies, chronic_conditions, current_medications, height, weight, emergency_contact, blood_type, userId],
            function(err) {
                if (err) return res.status(500).json({ error: 'Server error' });
                logAction(req.user.id, 'UPDATE', 'patients', userId, { allergies, chronic_conditions }, req.ip);
                res.json({ message: 'Patient updated successfully' });
            }
        );
    });
});

// Add medical history
app.post('/api/patients/:id/history', authenticateToken, (req, res) => {
    const userId = req.params.id;

    canAccessPatient(req.user, userId, (err, allowed) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!allowed) return res.status(403).json({ error: 'Insufficient permissions' });

        const { condition_name, diagnosed_date, severity, notes } = req.body;

        db.get(
            'SELECT id FROM patients WHERE user_id = ?',
            [userId],
            (err, patient) => {
                if (err || !patient) return res.status(404).json({ error: 'Patient not found' });

                db.run(
                    'INSERT INTO medical_history (patient_id, condition_name, diagnosed_date, severity, notes) VALUES (?, ?, ?, ?, ?)',
                    [patient.id, condition_name, diagnosed_date, severity, notes],
                    function(err) {
                        if (err) return res.status(500).json({ error: 'Server error' });
                        logAction(req.user.id, 'CREATE', 'medical_history', this.lastID, { condition_name }, req.ip);
                        res.status(201).json({ message: 'Medical history added' });
                    }
                );
            }
        );
    });
});

// ========== CONSULTATION & APPOINTMENT ROUTES ==========
// Appointments are consultations with a scheduled date/time/reason.
// Statuses: pending -> seen -> accepted -> in_progress -> completed
//           pending|seen -> rejected (with reason) | cancelled

// Allowed status transitions
const STATUS_TRANSITIONS = {
    'pending': ['seen', 'rejected', 'cancelled'],
    'seen': ['accepted', 'rejected', 'cancelled'],
    'accepted': ['in_progress', 'cancelled'],
    'in_progress': ['completed', 'follow_up'],
    'follow_up': ['completed'],
    'completed': [],
    'cancelled': [],
    'rejected': []
};

// Status -> timestamp column (set automatically on transition)
const STATUS_TIMESTAMP_COLUMNS = {
    'seen': 'seen_at',
    'accepted': 'accepted_at',
    'rejected': 'rejected_at',
    'cancelled': 'cancelled_at',
    'completed': 'completed_at'
};

// Who may perform a transition:
//  - patient: cancel (pending/seen/accepted)
//  - doctor: accept, reject, cancel, complete, start (their own appointments)
//  - admin: anything
const STATUS_ACTORS = {
    'cancelled': ['patient', 'doctor', 'admin'],
    'accepted': ['doctor', 'admin'],
    'rejected': ['doctor', 'admin'],
    'in_progress': ['doctor', 'admin'],
    'completed': ['doctor', 'admin'],
    'seen': ['doctor', 'admin'],
    'follow_up': ['doctor', 'admin']
};

// Human-friendly status label
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
    return labels[status] || status;
}

// Push a notification message between users (uses the messages table)
function notifyAppointment(senderId, recipientId, subject, body) {
    if (!senderId || !recipientId) return;
    db.run(
        'INSERT INTO messages (sender_id, recipient_id, subject, body, priority) VALUES (?, ?, ?, ?, ?)',
        [senderId, recipientId, subject, body, 'normal'],
        () => {}
    );
}

// Enrich a consultation row with nested doctor/patient objects (photos included)
function serializeAppointment(row) {
    if (!row) return row;
    return {
        ...row,
        patient: {
            id: row.patient_table_id,
            userId: row.patient_user_id,
            name: row.patient_name,
            photo: row.patient_photo || null,
            phone: row.patient_phone || null,
            email: row.patient_email || null
        },
        doctor: {
            id: row.doctor_id,
            name: row.doctor_name,
            photo: row.doctor_photo || null,
            specialty: row.specialty || null
        }
    };
}

const APPOINTMENT_SELECT = `
    c.*,
    p.id as patient_table_id, pu.full_name as patient_name, pu.id as patient_user_id,
    pu.photo as patient_photo, pu.phone as patient_phone, pu.email as patient_email,
    u.full_name as doctor_name, u.photo as doctor_photo, u.specialty
    FROM consultations c
    JOIN patients p ON c.patient_id = p.id
    JOIN users pu ON p.user_id = pu.id
    JOIN users u ON c.doctor_id = u.id`;

// Validate an appointment date is not in the past
function isValidAppointmentDate(dateStr) {
    if (!dateStr) return false;
    const today = new Date().toISOString().split('T')[0];
    return dateStr >= today;
}

// Resolve a patient reference (patients.id OR user_id) to the patients table id
function resolvePatientId(ref, cb) {
    db.get('SELECT id FROM patients WHERE id = ?', [ref], (err, byId) => {
        if (err) return cb(err, null);
        if (byId) return cb(null, byId.id);
        db.get('SELECT id FROM patients WHERE user_id = ?', [ref], (err2, byUser) => {
            if (err2) return cb(err2, null);
            cb(null, byUser ? byUser.id : null);
        });
    });
}

// Whether a user may access a given consultation (doctor's or their own)
function canAccessConsultation(user, consultation, cb) {
    if (user.role === 'admin') return cb(true);
    if (user.role === 'doctor') {
        return cb(String(consultation.doctor_id) === String(user.id));
    }
    db.get('SELECT user_id FROM patients WHERE id = ?', [consultation.patient_id], (err, p) => {
        cb(!err && p && String(p.user_id) === String(user.id));
    });
}

// Create consultation / book appointment
app.post('/api/consultations', authenticateToken, (req, res) => {
    const { patient_id, symptoms, vital_signs, appointment_date, appointment_time, reason, status } = req.body;

    if (!patient_id) {
        return res.status(400).json({ error: 'patient_id is required' });
    }

    resolvePatientId(patient_id, (err, pid) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!pid) return res.status(404).json({ error: 'Patient not found' });

        const isDoctor = req.user.role === 'doctor' || req.user.role === 'admin';
        const date = appointment_date || new Date().toISOString().split('T')[0];
        const finalStatus = isDoctor ? (status || 'in_progress') : 'pending';

        db.run(
            'INSERT INTO consultations (patient_id, doctor_id, date, appointment_time, reason, symptoms, vital_signs, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [pid, req.user.id, date, appointment_time || null, reason || null, symptoms || null,
             vital_signs ? JSON.stringify(vital_signs) : null, finalStatus],
            function(err) {
                if (err) return res.status(500).json({ error: 'Server error' });
                logAction(req.user.id, 'CREATE', 'consultations', this.lastID, { status: finalStatus }, req.ip);
                res.status(201).json({ message: 'Consultation created', consultation_id: this.lastID, status: finalStatus });
            }
        );
    });
});

// Get consultation by ID
app.get('/api/consultations/:id', authenticateToken, (req, res) => {
    const consultId = req.params.id;
    
    db.get(
        `SELECT c.*, p.id as patient_table_id, u.full_name as doctor_name, 
         pu.full_name as patient_name, pu.id as patient_user_id
         FROM consultations c
         JOIN users u ON c.doctor_id = u.id
         JOIN patients p ON c.patient_id = p.id
         JOIN users pu ON p.user_id = pu.id
         WHERE c.id = ?`,
        [consultId],
        (err, consultation) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            if (!consultation) return res.status(404).json({ error: 'Consultation not found' });

            canAccessConsultation(req.user, consultation, (allowed) => {
                if (!allowed) return res.status(403).json({ error: 'Insufficient permissions' });

                db.all(
                    'SELECT * FROM prescriptions WHERE consultation_id = ?',
                    [consultId],
                    (err, prescriptions) => {
                        db.all(
                            'SELECT * FROM reports WHERE consultation_id = ?',
                            [consultId],
                            (err, reports) => {
                                res.json({
                                    ...consultation,
                                    vital_signs: consultation.vital_signs ? JSON.parse(consultation.vital_signs) : {},
                                    prescriptions: prescriptions || [],
                                    reports: reports || []
                                });
                            }
                        );
                    }
                );
            });
        }
    );
});

// Update consultation (symptoms, vitals, notes, reschedule)
app.put('/api/consultations/:id', authenticateToken, (req, res) => {
    const consultId = req.params.id;
    const { symptoms, vital_signs, ai_suggestions, notes, diagnosis, status, appointment_date, appointment_time, reason } = req.body;

    db.get('SELECT * FROM consultations WHERE id = ?', [consultId], (err, existing) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!existing) return res.status(404).json({ error: 'Consultation not found' });

        canAccessConsultation(req.user, existing, (allowed) => {
            if (!allowed) return res.status(403).json({ error: 'Insufficient permissions' });

            if (status && status !== existing.status) {
                if (!STATUS_TRANSITIONS[existing.status] || !STATUS_TRANSITIONS[existing.status].includes(status)) {
                    return res.status(400).json({ error: `Cannot change status from '${existing.status}' to '${status}'` });
                }
                if (req.user.role === 'patient' && status !== 'cancelled') {
                    return res.status(403).json({ error: 'You can only cancel your appointment' });
                }
                if (status === 'rejected' && !req.body.rejection_reason) {
                    return res.status(400).json({ error: 'A rejection reason is required' });
                }
            }

            db.run(
                `UPDATE consultations SET symptoms = ?, vital_signs = ?, ai_suggestions = ?, notes = ?, diagnosis = ?, status = ?, date = ?, appointment_time = ?, reason = ? WHERE id = ?`,
                [symptoms ?? existing.symptoms,
                 vital_signs !== undefined ? JSON.stringify(vital_signs) : existing.vital_signs,
                 ai_suggestions !== undefined ? JSON.stringify(ai_suggestions) : existing.ai_suggestions,
                 notes ?? existing.notes,
                 diagnosis ?? existing.diagnosis,
                 status ?? existing.status,
                 appointment_date ?? existing.date,
                 appointment_time ?? existing.appointment_time,
                 reason ?? existing.reason,
                 consultId],
                function(err) {
                    if (err) return res.status(500).json({ error: 'Server error' });
                    if (this.changes === 0) return res.status(404).json({ error: 'Consultation not found' });
                    logAction(req.user.id, 'UPDATE', 'consultations', consultId, {}, req.ip);
                    res.json({ message: 'Consultation updated' });
                }
            );
        });
    });
});

// Update consultation/appointment status with transition validation
app.patch('/api/consultations/:id/status', authenticateToken, (req, res) => {
    const consultId = req.params.id;
    const { status, rejection_reason } = req.body;

    if (!status || !STATUS_TRANSITIONS[status]) {
        return res.status(400).json({ error: 'Invalid status' });
    }
    if (status === 'rejected' && !rejection_reason) {
        return res.status(400).json({ error: 'A rejection reason is required' });
    }

    db.get('SELECT * FROM consultations WHERE id = ?', [consultId], (err, existing) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!existing) return res.status(404).json({ error: 'Consultation not found' });

        if (!STATUS_TRANSITIONS[existing.status] || !STATUS_TRANSITIONS[existing.status].includes(status)) {
            return res.status(400).json({ error: `Cannot change status from '${existing.status}' to '${status}'` });
        }

        // Role gate: patients may only cancel; doctors act on their own appointments; admins can do anything
        if (req.user.role === 'patient' && status !== 'cancelled') {
            return res.status(403).json({ error: 'You can only cancel your appointment' });
        }
        if (req.user.role === 'doctor' && String(existing.doctor_id) !== String(req.user.id)) {
            return res.status(403).json({ error: 'You can only manage your own appointments' });
        }

        canAccessConsultation(req.user, existing, (allowed) => {
            if (!allowed) return res.status(403).json({ error: 'Insufficient permissions' });

            const tsCol = STATUS_TIMESTAMP_COLUMNS[status];
            const extraSets = [];
            const extraParams = [];
            if (tsCol) {
                extraSets.push(`${tsCol} = CURRENT_TIMESTAMP`);
            }
            if (status === 'cancelled') {
                extraSets.push('cancelled_by = ?');
                extraParams.push(req.user.role);
            }
            if (status === 'rejected') {
                extraSets.push('rejection_reason = ?');
                extraParams.push(rejection_reason);
            }
            const setSql = extraSets.length ? ', ' + extraSets.join(', ') : '';

            db.run(`UPDATE consultations SET status = ?${setSql} WHERE id = ?`, [status, ...extraParams, consultId], function(err2) {
                if (err2) return res.status(500).json({ error: 'Server error' });
                logAction(req.user.id, 'UPDATE', 'consultations', consultId, { status }, req.ip);
                db.get('SELECT user_id FROM patients WHERE id = ?', [existing.patient_id], (errP, pRow) => {
                    const patientUserId = pRow ? pRow.user_id : null;
                    const isDoctorActor = req.user.role === 'doctor' || req.user.role === 'admin';
                    const recipient = isDoctorActor ? patientUserId : existing.doctor_id;
                    const statusMsgs = {
                        accepted: ['Appointment accepted', 'Your appointment has been confirmed by the doctor.'],
                        rejected: ['Appointment rejected', `Your appointment was rejected. Reason: ${rejection_reason}`],
                        cancelled: ['Appointment cancelled', 'An appointment was cancelled.'],
                        completed: ['Appointment completed', 'Your appointment has been marked as completed.'],
                        in_progress: ['Consultation started', 'Your consultation has started.']
                    };
                    const msg = statusMsgs[status];
                    if (recipient && msg) {
                        notifyAppointment(req.user.id, recipient, msg[0], msg[1]);
                    }
                    res.json({ message: 'Status updated', consultation_id: consultId, status });
                });
            });
        });
    });
});

// Get patient's consultations
app.get('/api/patients/:patient_id/consultations', authenticateToken, (req, res) => {
    const patientId = req.params.patient_id;

    canAccessPatient(req.user, patientId, (err, allowed) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!allowed) return res.status(403).json({ error: 'Insufficient permissions' });

        db.get(
            'SELECT id FROM patients WHERE user_id = ?',
            [patientId],
            (err, patient) => {
                if (err || !patient) return res.status(404).json({ error: 'Patient not found' });

                db.all(
                    `SELECT c.*, u.full_name as doctor_name FROM consultations c
                     JOIN users u ON c.doctor_id = u.id 
                     WHERE c.patient_id = ? ORDER BY c.created_at DESC`,
                    [patient.id],
                    (err, consultations) => {
                        if (err) return res.status(500).json({ error: 'Server error' });
                        res.json(consultations);
                    }
                );
            }
        );
    });
});

// ========== AI ASSISTANT ROUTE ==========

app.post('/api/ai/analyze-symptoms', authenticateToken, async (req, res) => {
    const { symptoms, patient_id } = req.body;
    
    try {
        let patientInfo = null;
        if (patient_id) {
            const profileRes = await new Promise((resolve) => {
                db.get(
                    `SELECT p.allergies, p.chronic_conditions, p.current_medications, p.blood_type, u.full_name
                     FROM patients p JOIN users u ON p.user_id = u.id WHERE p.user_id = ?`,
                    [patient_id],
                    (err, row) => resolve(row)
                );
            });
            patientInfo = profileRes;
        }

        const aiResponse = generateAISuggestions(symptoms, patientInfo);
        res.json(aiResponse);
    } catch (error) {
        res.status(500).json({ error: 'AI analysis failed' });
    }
});

function generateAISuggestions(symptoms, patientInfo) {
    const commonConditions = {
        'fever': [
            { condition: 'Viral Infection', probability: 'High', questions: ['How long have you had the fever?', 'Any body aches?', 'Recent exposure to sick contacts?'] },
            { condition: 'Bacterial Infection', probability: 'Medium', questions: ['Is the fever continuous?', 'Any cough?', 'Recent antibiotic use?'] },
            { condition: 'COVID-19', probability: 'High', questions: ['Loss of taste/smell?', 'Dry cough?', 'Difficulty breathing?'] }
        ],
        'headache': [
            { condition: 'Tension Headache', probability: 'High', questions: ['Stress levels?', 'Neck tension?', 'Sleep quality?'] },
            { condition: 'Migraine', probability: 'Medium', questions: ['Aura present?', 'Family history?', 'Light sensitivity?'] },
            { condition: 'Sinusitis', probability: 'Medium', questions: ['Facial pain?', 'Thick nasal discharge?', 'Recent cold?'] }
        ],
        'cough': [
            { condition: 'Upper Respiratory Infection', probability: 'High', questions: ['Duration of cough?', 'Fever present?', 'Sore throat?'] },
            { condition: 'Bronchitis', probability: 'Medium', questions: ['Phlegm production?', 'Wheezing?', 'Smoking history?'] },
            { condition: 'GERD', probability: 'Medium', questions: ['Heartburn?', 'Worsens after eating?', 'Sour taste?'] }
        ],
        'fatigue': [
            { condition: 'Anemia', probability: 'Medium', questions: ['Pale appearance?', 'Shortness of breath?', 'Diet changes?'] },
            { condition: 'Thyroid Disorder', probability: 'Medium', questions: ['Weight changes?', 'Hair loss?', 'Temperature sensitivity?'] },
            { condition: 'Depression', probability: 'Medium', questions: ['Sleep changes?', 'Appetite changes?', 'Interest in activities?'] }
        ],
        'chest pain': [
            { condition: 'GERD', probability: 'High', questions: ['Heartburn?', 'Worsens after eating?', 'Regurgitation?'] },
            { condition: 'Anxiety', probability: 'Medium', questions: ['Shortness of breath?', 'Rapid heartbeat?', 'Triggers?'] },
            { condition: 'Musculoskeletal Pain', probability: 'Medium', questions: ['Worsens with movement?', 'Localized pain?', 'Recent injury?'] }
        ],
        'abdominal pain': [
            { condition: 'Gastritis', probability: 'High', questions: ['Meal-related?', 'Nausea?', 'Burning sensation?'] },
            { condition: 'Food Poisoning', probability: 'Medium', questions: ['Recent food intake?', 'Vomiting?', 'Diarrhea?'] },
            { condition: 'IBS', probability: 'Medium', questions: ['Bowel habit changes?', 'Stress correlation?', 'Food triggers?'] }
        ]
    };

    let differential = [];
    let questions = [];
    
    const symptomKeys = Object.keys(commonConditions);
    const matchedSymptoms = symptomKeys.filter(key => 
        symptoms.toLowerCase().includes(key)
    );
    
    matchedSymptoms.forEach(symptom => {
        commonConditions[symptom].forEach(cond => {
            differential.push(cond);
            questions.push(...cond.questions);
        });
    });
    
    // Deduplicate questions
    questions = [...new Set(questions)];
    
    // Safety alerts
    const safetyAlerts = [];
    if (patientInfo?.allergies) {
        safetyAlerts.push({
            severity: 'high',
            type: 'Allergy Note',
            message: `Patient has documented allergies: ${patientInfo.allergies}`
        });
    }
    if (patientInfo?.current_medications) {
        safetyAlerts.push({
            severity: 'medium',
            type: 'Current Medications',
            message: `Patient is currently on: ${patientInfo.current_medications}`
        });
    }
    
    // Critical symptoms alert
    if (symptoms.toLowerCase().includes('chest pain') || symptoms.toLowerCase().includes('difficulty breathing')) {
        safetyAlerts.push({
            severity: 'high',
            type: 'Critical Symptom',
            message: 'Patient reports chest pain or difficulty breathing - consider immediate evaluation'
        });
    }
    
    return {
        differential_diagnosis: differential,
        suggested_questions: questions.slice(0, 5),
        summary: `Patient presents with: ${symptoms}. ${differential.length} potential conditions identified.`,
        safety_alerts: safetyAlerts
    };
}

// ========== AI MEDICAL ASSISTANT API ==========

const aiService = require('./api/ai-service');

// Medical Knowledge Base API
const medicalKnowledgeRoutes = require('./api/medical-knowledge-routes');
app.use('/api/medical-knowledge', medicalKnowledgeRoutes);

// AI Chat endpoint
app.post('/api/ai/chat', authenticateToken, async (req, res) => {
    const { message, role, conversationLanguage, conversationLocale, reportContext } = req.body;
    if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Message is required' });
    }
    try {
        // Use conversation language from request, fallback to user's preferred language
        let lang = conversationLanguage || null;
        let locale = conversationLocale || null;
        if (!lang) {
            const user = await new Promise((resolve) => {
                db.get('SELECT preferredLanguage, preferredLocale FROM users WHERE id = ?', [req.user.id], (err, row) => {
                    resolve(err ? null : row);
                });
            });
            if (user && user.preferredLanguage) {
                lang = user.preferredLanguage;
                locale = user.preferredLocale || user.preferredLanguage + '-IN';
            }
        }
        const context = {
            role: role || req.user.role,
            userId: req.user.id,
            conversationLanguage: lang,
            conversationLocale: locale,
            reportContext: reportContext || null
        };
        const result = await aiService.chat(message, context);
        res.json(result);
    } catch (error) {
        console.error('AI chat error:', error);
        res.status(500).json({ error: 'AI analysis failed' });
    }
});

// AI Analyze medical report upload
app.post('/api/ai/analyze-report', authenticateToken, upload.single('report'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    try {
        const validation = aiService.validateFile(req.file);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const fs = require('fs');
        const ocrService = require('./api/ocr-service');
        let content = '';
        let ocrResult = null;

        if (req.file.mimetype === 'text/plain' || req.file.mimetype === 'text/csv') {
            // Text files: read directly
            content = fs.readFileSync(req.file.path, 'utf8');
        } else if (req.file.mimetype.startsWith('image/')) {
            // Image files: run full OCR pipeline
            ocrResult = await ocrService.processReportImage(req.file.path, req.file.originalname);

            if (ocrResult.error && !ocrResult.success) {
                return res.json({
                    analysis: {
                        summary: { title: 'Report Analysis', type: 'image' },
                        findings: [],
                        explanation: ocrResult.error,
                        concerns: [],
                        questionsForDoctor: [],
                        whenToSeekHelp: '',
                        disclaimer: aiService.DISCLAIMER
                    },
                    classification: { isMedical: false, confidence: 0 },
                    ocr: {
                        text: ocrResult.ocrText,
                        confidence: ocrResult.ocrConfidence,
                        quality: ocrResult.quality
                    },
                    fileName: req.file.originalname,
                    fileType: validation.fileType
                });
            }

            content = ocrResult.ocrText || '';

            // If OCR got raw text, also run extraction
            if (ocrResult.extractedData && ocrResult.extractedData.tests.length > 0) {
                // Build structured content from extracted data for analysis
                let structured = '';
                for (const test of ocrResult.extractedData.tests) {
                    structured += `${test.name}: ${test.value} ${test.unit}`;
                    if (test.referenceRange) structured += ` (Reference: ${test.referenceRange})`;
                    structured += '\n';
                }
                if (ocrResult.extractedData.hospitalName) structured += `\nFacility: ${ocrResult.extractedData.hospitalName}`;
                if (ocrResult.extractedData.date) structured += `\nDate: ${ocrResult.extractedData.date}`;
                if (ocrResult.extractedData.reportType) structured += `\nReport Type: ${ocrResult.extractedData.reportType}`;
                for (const section of ocrResult.extractedData.sections) {
                    structured += `\n${section}`;
                }
                content = structured || content;
            }
        } else {
            content = `[File uploaded: ${req.file.originalname} (${req.file.mimetype}, ${(req.file.size/1024).toFixed(1)}KB)]`;
        }

        const classification = ocrResult
            ? ocrResult.medicalDetection || aiService.classifyDocument(content, req.file.mimetype)
            : aiService.classifyDocument(content, req.file.mimetype);

        // ── Report Type Detection ────────────────────────────────────────────
        const reportTypeAnalyzer = require('./api/report-type-analyzer');
        const reportTypeResult = reportTypeAnalyzer.detectReportType(content);

        // Pass OCR-extracted tests directly to analysis for accurate results
        const preExtractedTests = (ocrResult && ocrResult.extractedData && ocrResult.extractedData.tests.length > 0)
            ? ocrResult.extractedData.tests
            : null;

        const analysis = aiService.analyzeReport(content, req.file.mimetype, req.body.report_type, preExtractedTests);

        // Run specialized analysis for non-lab report types
        let specializedAnalysis = null;
        if (reportTypeResult.type !== 'unknown' && reportTypeResult.type !== 'prescription') {
            specializedAnalysis = reportTypeAnalyzer.analyzeByType(content, reportTypeResult.type);
        }

        // Build response with OCR data if available
        const response = {
            analysis,
            classification,
            reportType: reportTypeResult.type !== 'unknown' ? reportTypeResult : null,
            specializedAnalysis,
            fileName: req.file.originalname,
            fileType: validation.fileType,
            savedTo: req.file.path
        };

        if (ocrResult) {
            response.ocr = {
                text: ocrResult.ocrText,
                confidence: ocrResult.ocrConfidence,
                quality: ocrResult.quality,
                extractedData: ocrResult.extractedData,
                isMedical: ocrResult.isMedical
            };
        }

        // Search medical knowledge base for relevant info about extracted tests
        if (preExtractedTests && preExtractedTests.length > 0) {
            try {
                const medicalKnowledgeService = require('./api/medical-knowledge-service');
                const testNames = preExtractedTests.map(t => t.name).join(' ');
                const kbSearch = await medicalKnowledgeService.searchKnowledge(testNames + ' lab test interpretation reference range', { limit: 3 });
                if (kbSearch.chunks && kbSearch.chunks.length > 0) {
                    response.knowledgeBase = {
                        sources: kbSearch.sources.map(s => ({ name: s.name, author: s.author, year: s.year, url: s.url })),
                        info: kbSearch.chunks.slice(0, 2).map(c => c.content.substring(0, 300))
                    };
                }
            } catch (kbErr) {
                // Knowledge base search is non-critical
            }
        }

        res.json(response);
    } catch (error) {
        console.error('Report analysis error:', error);
        res.status(500).json({ error: 'Report analysis failed' });
    }
});

// AI Analyze symptom photo (now also reads report photos via OCR)
app.post('/api/ai/analyze-photo', authenticateToken, upload.single('photo'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    try {
        const validation = aiService.validateFile(req.file);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const ocrService = require('./api/ocr-service');
        const description = req.body.description || '';

        // Run OCR pipeline on the image to see if it's a medical report
        const ocrResult = await ocrService.processReportImage(req.file.path, req.file.originalname);

        if (ocrResult.isMedical && ocrResult.success) {
            // It's a medical report photo — analyze as report
            let content = '';
            if (ocrResult.extractedData && ocrResult.extractedData.tests.length > 0) {
                let structured = '';
                for (const test of ocrResult.extractedData.tests) {
                    structured += `${test.name}: ${test.value} ${test.unit}`;
                    if (test.referenceRange) structured += ` (Reference: ${test.referenceRange})`;
                    structured += '\n';
                }
                if (ocrResult.extractedData.reportType) structured += `\nReport Type: ${ocrResult.extractedData.reportType}`;
                content = structured || ocrResult.ocrText;
            } else {
                content = ocrResult.ocrText;
            }

            const analysis = aiService.analyzeReport(content, req.file.mimetype, 'photo_report');

            // Report type detection for photo reports
            const reportTypeAnalyzer2 = require('./api/report-type-analyzer');
            const reportTypeResult2 = reportTypeAnalyzer2.detectReportType(content);
            let specializedAnalysis2 = null;
            if (reportTypeResult2.type !== 'unknown' && reportTypeResult2.type !== 'prescription') {
                specializedAnalysis2 = reportTypeAnalyzer2.analyzeByType(content, reportTypeResult2.type);
            }

            res.json({
                analysis,
                type: 'report',
                reportType: reportTypeResult2.type !== 'unknown' ? reportTypeResult2 : null,
                specializedAnalysis: specializedAnalysis2,
                ocr: {
                    text: ocrResult.ocrText,
                    confidence: ocrResult.ocrConfidence,
                    quality: ocrResult.quality,
                    extractedData: ocrResult.extractedData
                },
                fileName: req.file.originalname,
                fileType: validation.fileType,
                savedTo: req.file.path
            });
        } else {
            // Not a medical report — treat as symptom photo
            const analysis = aiService.analyzeSymptomPhoto(description || ocrResult.ocrText || 'No description provided');

            res.json({
                analysis,
                type: 'symptom',
                fileName: req.file.originalname,
                fileType: validation.fileType,
                savedTo: req.file.path
            });
        }
    } catch (error) {
        console.error('Photo analysis error:', error);
        res.status(500).json({ error: 'Photo analysis failed' });
    }
});

// ========== REPORT ROUTES ==========

// Upload report (doctor: only for related patients; admin: any)
app.post('/api/reports/upload', authenticateToken, requireRole('doctor'), upload.single('report'), (req, res) => {
    const { patient_id, consultation_id, report_type } = req.body;

    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    canAccessPatient(req.user, patient_id, (err, allowed) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!allowed) return res.status(403).json({ error: 'Insufficient permissions' });

        resolvePatientId(patient_id, (err2, pid) => {
            if (err2) return res.status(500).json({ error: 'Server error' });
            if (!pid) return res.status(404).json({ error: 'Patient not found' });

            const fileSize = req.file.size;

            db.run(
                'INSERT INTO reports (patient_id, consultation_id, file_name, file_path, file_type, file_size, report_type, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [pid, consultation_id || null, req.file.originalname, req.file.path, req.file.mimetype, fileSize, report_type, req.user.id],
                function(err) {
                    if (err) return res.status(500).json({ error: 'Server error' });
                    logAction(req.user.id, 'CREATE', 'reports', this.lastID, { file_name: req.file.originalname }, req.ip);
                    res.status(201).json({ message: 'Report uploaded', report_id: this.lastID, file_path: req.file.path });
                }
            );
        });
    });
});

// Analyze report (AI)
app.post('/api/reports/:id/analyze', authenticateToken, async (req, res) => {
    const reportId = req.params.id;
    
    db.get('SELECT * FROM reports WHERE id = ?', [reportId], (err, report) => {
        if (err || !report) return res.status(404).json({ error: 'Report not found' });

        // Only the patient, the doctor with a relationship to that patient, or an admin may analyze
        const canAccessReport = (cb) => {
            if (req.user.role === 'admin') return cb(null, true);
            if (req.user.role === 'patient') {
                return db.get('SELECT 1 FROM patients WHERE id = ? AND user_id = ?', [report.patient_id, req.user.id], (e, p) => cb(e, !!p));
            }
            if (req.user.role === 'doctor') {
                return db.get(
                    `SELECT 1 FROM consultations c JOIN patients p ON c.patient_id = p.id
                     WHERE c.doctor_id = ? AND p.id = ? LIMIT 1`,
                    [req.user.id, report.patient_id],
                    (e, row) => cb(e, !!row)
                );
            }
            cb(null, false);
        };

        canAccessReport((errA, allowed) => {
            if (errA) return res.status(500).json({ error: 'Server error' });
            if (!allowed) return res.status(403).json({ error: 'Insufficient permissions' });
            analyzeReport();
        });

        function analyzeReport() {
        
        // Simulate AI analysis based on file type
        let aiAnalysis = '';
        let importantValues = '';
        
        if (report.file_type?.includes('text') || report.file_name?.includes('.txt')) {
            // Read text file and analyze
            const fs = require('fs');
            const filePath = path.join(__dirname, report.file_path);
            
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                aiAnalysis = analyzeTextReport(content);
                importantValues = extractImportantValues(content);
            } catch (e) {
                aiAnalysis = 'Unable to read file content for analysis';
            }
        } else if (report.file_type?.includes('json')) {
            const fs = require('fs');
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const data = JSON.parse(content);
                aiAnalysis = `Report analysis complete. ${JSON.stringify(data).slice(0, 200)}...`;
                importantValues = JSON.stringify(extractValuesFromJSON(data));
            } catch (e) {
                aiAnalysis = 'Unable to parse JSON data';
            }
        } else {
            aiAnalysis = 'AI analysis for image/PDF reports requires specialized OCR processing. File uploaded successfully.';
            importantValues = 'Manual review required for non-text reports.';
        }
        
        db.run(
            'UPDATE reports SET ai_analysis = ?, important_values = ? WHERE id = ?',
            [JSON.stringify(aiAnalysis), JSON.stringify(importantValues), reportId],
            function(err) {
                if (err) return res.status(500).json({ error: 'Server error' });
                logAction(req.user.id, 'ANALYZE', 'reports', reportId, {}, req.ip);
                res.json({ 
                    ai_analysis: aiAnalysis,
                    important_values: importantValues,
                    report_type: report.report_type,
                    file_name: report.file_name
                });
            }
        );
        }
    });
});

function analyzeTextReport(content) {
    const lines = content.split('\n');
    let analysis = '';
    
    const markers = {
        'glucose': 'Blood Sugar',
        'hemoglobin': 'Hemoglobin',
        'wbc': 'White Blood Cell Count',
        'rbc': 'Red Blood Cell Count',
        'bp': 'Blood Pressure',
        'cholesterol': 'Cholesterol',
        'creatinine': 'Kidney Function',
        'alt': 'Liver Enzyme',
        'ast': 'Liver Enzyme',
        'tsh': 'Thyroid Function'
    };
    
    const findings = [];
    
    for (const [key, label] of Object.entries(markers)) {
        const regex = new RegExp(`${key}[:\\s]*([\\d.]+)`, 'i');
        const match = content.match(regex);
        if (match) {
            findings.push(`${label}: ${match[1]}`);
        }
    }
    
    analysis = `Lab report analysis completed.\nKey findings identified:\n${findings.join('\n')}\n\n`;
    
    if (findings.length === 0) {
        analysis = 'No standard lab values detected. Full report review recommended.';
    }
    
    return analysis;
}

function extractImportantValues(content) {
    const values = [];
    const patterns = [
        { name: 'Glucose', pattern: /glucose[:\s]*([\d.]+)/i },
        { name: 'Hemoglobin', pattern: /hemoglobin[:\s]*([\d.]+)/i },
        { name: 'Cholesterol', pattern: /cholesterol[:\s]*([\d.]+)/i },
        { name: 'Creatinine', pattern: /creatinine[:\s]*([\d.]+)/i }
    ];
    
    patterns.forEach(({ name, pattern }) => {
        const match = content.match(pattern);
        if (match) {
            values.push({ name, value: match[1] });
        }
    });
    
    return values;
}

function extractValuesFromJSON(data) {
    if (typeof data === 'object' && data !== null) {
        if (data.lab_results || data.tests) {
            return data.lab_results || data.tests;
        }
        return Object.values(data).filter(v => typeof v === 'number' || typeof v === 'string').slice(0, 10);
    }
    return data;
}

// Get patient reports
app.get('/api/patients/:patient_id/reports', authenticateToken, (req, res) => {
    const userId = req.params.patient_id;

    canAccessPatient(req.user, userId, (err, allowed) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!allowed) return res.status(403).json({ error: 'Insufficient permissions' });

        db.get(
            'SELECT id FROM patients WHERE user_id = ?',
            [userId],
            (err, patient) => {
                if (err || !patient) return res.status(404).json({ error: 'Patient not found' });

                db.all(
                    'SELECT * FROM reports WHERE patient_id = ? ORDER BY created_at DESC',
                    [patient.id],
                    (err, reports) => {
                        if (err) return res.status(500).json({ error: 'Server error' });
                        res.json(reports);
                    }
                );
            }
        );
    });
});

// ========== PRESCRIPTION ROUTES ==========

// Drug database for interaction checking
const DRUG_INTERACTIONS = {
    'warfarin': ['aspirin', 'ibuprofen', 'nstest', 'amiodarone'],
    'aspirin': ['warfarin', 'heparin', 'clopidogrel'],
    'metformin': ['contrast dye', 'iv contrast'],
    'lisinopril': ['potassium supplements', 'spironolactone'],
    'atorvastatin': ['gemfibrozil', 'cyclosporine'],
    'omeprazole': ['clopidogrel', 'warfarin']
};

// Create prescription
app.post('/api/prescriptions', authenticateToken, requireRole('doctor'), (req, res) => {
    const { consultation_id, patient_id, medication_name, dosage, frequency, duration, instructions } = req.body;
    
    // Check for drug interactions
    const alerts = checkDrugInteractions(medication_name, patient_id);
    
    db.run(
        'INSERT INTO prescriptions (consultation_id, patient_id, doctor_id, medication_name, dosage, frequency, duration, instructions, drug_interaction_alerts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [consultation_id, patient_id, req.user.id, medication_name, dosage, frequency, duration, instructions, JSON.stringify(alerts)],
        function(err) {
            if (err) return res.status(500).json({ error: 'Server error' });
            
            // Add to prescription logs
            db.run(
                'INSERT INTO prescription_logs (patient_id, medication_name, dosage, frequency, duration, start_date) VALUES (?, ?, ?, ?, ?, date())',
                [patient_id, medication_name, dosage, frequency, duration],
                function() {
                    logAction(req.user.id, 'CREATE', 'prescriptions', this.lastID, { medication_name }, req.ip);
                    res.status(201).json({ 
                        message: 'Prescription created', 
                        prescription_id: this.lastID,
                        drug_interaction_alerts: alerts
                    });
                }
            );
        }
    );
});

function checkDrugInteractions(medicationName, patientId) {
    const alerts = [];
    const medLower = medicationName.toLowerCase();
    
    // Check known interactions
    if (DRUG_INTERACTIONS[medLower]) {
        DRUG_INTERACTIONS[medLower].forEach(interaction => {
            alerts.push({
                severity: 'high',
                interaction: interaction,
                message: `${medicationName} may interact with ${interaction}. Monitor closely.`
            });
        });
    }
    
    // Check patient's current medications
    return new Promise((resolve) => {
        db.get(
            'SELECT current_medications FROM patients WHERE user_id = ?',
            [patientId],
            (err, patient) => {
                if (patient?.current_medications) {
                    const meds = patient.current_medications.split(',').map(m => m.trim().toLowerCase());
                    meds.forEach(med => {
                        if (DRUG_INTERACTIONS[medLower]?.includes(med) || 
                            (DRUG_INTERACTIONS[med]?.includes(medLower))) {
                            alerts.push({
                                severity: 'high',
                                interaction: med,
                                message: `${medicationName} may interact with patient's current medication: ${med}`
                            });
                        }
                    });
                }
                resolve(alerts);
            }
        );
    });
}

// Get prescriptions for consultation
app.get('/api/consultations/:id/prescriptions', authenticateToken, (req, res) => {
    const consultId = req.params.id;
    
    db.all(
        `SELECT p.*, u.full_name as doctor_name FROM prescriptions p JOIN users u ON p.doctor_id = u.id WHERE consultation_id = ?`,
        [consultId],
        (err, prescriptions) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            res.json(prescriptions);
        }
    );
});

// Get patient prescriptions
app.get('/api/patients/:patient_id/prescriptions', authenticateToken, (req, res) => {
    const userId = req.params.patient_id;

    canAccessPatient(req.user, userId, (err, allowed) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!allowed) return res.status(403).json({ error: 'Insufficient permissions' });

        db.get(
            'SELECT id FROM patients WHERE user_id = ?',
            [userId],
            (err, patient) => {
                if (err || !patient) return res.status(404).json({ error: 'Patient not found' });
            
            db.all(
                'SELECT * FROM prescription_logs WHERE patient_id = ? ORDER BY created_at DESC',
                [patient.id],
                (err, prescriptions) => {
                    if (err) return res.status(500).json({ error: 'Server error' });
                    res.json(prescriptions);
                }
            );
            }
        );
    });
});

// Generate prescription PDF
// Generate prescription PDF (supports Authorization header or ?token= for download links)
app.get('/api/prescriptions/:id/pdf', (req, res, next) => {
    const token = readToken(req) || req.query.token;
    if (!token) return res.status(401).json({ error: 'Access token required' });
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
}, (req, res) => {
    const prescId = req.params.id;
    
    db.get(
        `SELECT p.*, u.full_name as doctor_name, pu.full_name as patient_name, pcons.date as consult_date
         FROM prescriptions p
         JOIN users u ON p.doctor_id = u.id
         JOIN patients pat ON p.patient_id = pat.id
         JOIN users pu ON pat.user_id = pu.id
         JOIN consultations pcons ON p.consultation_id = pcons.id
         WHERE p.id = ?`,
        [prescId],
        (err, prescription) => {
            if (err || !prescription) return res.status(404).json({ error: 'Prescription not found' });
            
            const alerts = prescription.drug_interaction_alerts ? JSON.parse(prescription.drug_interaction_alerts) : [];
            
            let html = `
<!DOCTYPE html>
<html>
<head>
    <title>Prescription</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 40px; }
        .header { border-bottom: 2px solid #2563eb; padding-bottom: 15px; margin-bottom: 25px; }
        .logo { font-size: 24px; font-weight: bold; color: #2563eb; }
        .prescription-info { display: flex; justify-content: space-between; margin-bottom: 30px; }
        .info-block h4 { margin-bottom: 5px; color: #333; }
        .info-block p { color: #666; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
        th { background: #f0f9ff; }
        .alerts { background: #fffbeb; border: 1px solid #f59e0b; padding: 15px; border-radius: 6px; margin: 20px 0; }
        .footer { margin-top: 40px; font-size: 12px; color: #999; }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">Dr. Johnson Medical Practice</div>
        <p>123 Medical Dr, Suite 100, New York, NY 10001 | (555) 123-4567</p>
    </div>
    
    <div class="prescription-info">
        <div class="info-block">
            <h4>Patient Information</h4>
            <p><strong>Name:</strong> ${prescription.patient_name}</p>
            <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
        </div>
        <div class="info-block">
            <h4>Doctor Information</h4>
            <p><strong>Name:</strong> ${prescription.doctor_name}</p>
            <p><strong>Date:</strong> ${new Date(prescription.consult_date).toLocaleDateString()}</p>
        </div>
    </div>
    
    <table>
        <thead>
            <tr>
                <th>Medication</th>
                <th>Dosage</th>
                <th>Frequency</th>
                <th>Duration</th>
                <th>Instructions</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>${prescription.medication_name}</td>
                <td>${prescription.dosage}</td>
                <td>${prescription.frequency}</td>
                <td>${prescription.duration}</td>
                <td>${prescription.instructions || 'N/A'}</td>
            </tr>
        </tbody>
    </table>
    
    ${alerts.length > 0 ? `
    <div class="alerts">
        <h4 style="color: #92400e;">Drug Interaction Alerts</h4>
        ${alerts.map(a => `<p style="margin: 5px 0;">⚠️ ${a.message}</p>`).join('')}
    </div>
    ` : ''}
    
    <div class="footer">
        <p>This prescription was generated by Dr. Johnson Medical Practice.</p>
        <p>It is valid for 30 days from the date of issue.</p>
    </div>
</body>
</html>
            `;
            
            res.setHeader('Content-Type', 'text/html');
            res.send(html);
        }
    );
});

// ========== MESSAGE ROUTES ==========

// Send message
app.post('/api/messages', authenticateToken, (req, res) => {
    const { recipient_id, subject, body, priority } = req.body;
    
    if (!recipient_id || !body) {
        return res.status(400).json({ error: 'recipient_id and body are required' });
    }
    
    db.run(
        'INSERT INTO messages (sender_id, recipient_id, subject, body, priority) VALUES (?, ?, ?, ?, ?)',
        [req.user.id, recipient_id, subject || null, body, priority || 'normal'],
        function(err) {
            if (err) return res.status(500).json({ error: 'Server error' });
            logAction(req.user.id, 'CREATE', 'messages', this.lastID, {}, req.ip);
            res.status(201).json({ message: 'Message sent', message_id: this.lastID });
        }
    );
});

// Get messages for user (supports ?conversation_with=, ?unread=1, ?search=)
app.get('/api/messages', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const { conversation_with, unread, search } = req.query;

    let where = 'WHERE (m.sender_id = ? OR m.recipient_id = ?)';
    const params = [userId, userId];

    if (conversation_with) {
        where += ' AND ((m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?))';
        params.push(userId, conversation_with, conversation_with, userId);
    }
    if (unread === '1' || unread === 'true') {
        where += ' AND m.is_read = 0 AND m.recipient_id = ?';
        params.push(userId);
    }
    if (search) {
        where += ' AND (m.subject LIKE ? OR m.body LIKE ? OR u.full_name LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    db.all(
        `SELECT m.*, u.full_name as sender_name, r.full_name as recipient_name 
         FROM messages m 
         JOIN users u ON m.sender_id = u.id 
         LEFT JOIN users r ON m.recipient_id = r.id 
         ${where}
         ORDER BY m.created_at ASC`,
        params,
        (err, messages) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            res.json(messages);
        }
    );
});

// Get unread message count for the current user
app.get('/api/messages/unread-count', authenticateToken, (req, res) => {
    db.get(
        'SELECT COUNT(*) as count FROM messages WHERE is_read = 0 AND recipient_id = ?',
        [req.user.id],
        (err, row) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            res.json({ count: row?.count || 0 });
        }
    );
});

// Get conversation list (grouped by the other participant)
app.get('/api/messages/conversations', authenticateToken, (req, res) => {
    const userId = req.user.id;

    db.all(
        `SELECT m.*, u.full_name as sender_name, r.full_name as recipient_name 
         FROM messages m 
         JOIN users u ON m.sender_id = u.id 
         LEFT JOIN users r ON m.recipient_id = r.id 
         WHERE m.sender_id = ? OR m.recipient_id = ? 
         ORDER BY m.created_at DESC`,
        [userId, userId],
        (err, messages) => {
            if (err) return res.status(500).json({ error: 'Server error' });

            const byPeer = new Map();
            messages.forEach((m) => {
                const peerId = m.sender_id === userId ? m.recipient_id : m.sender_id;
                if (!peerId) return;
                if (!byPeer.has(peerId)) {
                    byPeer.set(peerId, {
                        peer_id: peerId,
                        peer_name: m.sender_id === userId ? m.recipient_name : m.sender_name,
                        last_message: m.body,
                        last_subject: m.subject,
                        last_at: m.created_at,
                        unread_count: 0
                    });
                }
                if (m.recipient_id === userId && !m.is_read) {
                    byPeer.get(peerId).unread_count += 1;
                }
            });

            res.json([...byPeer.values()]);
        }
    );
});

// Mark message as read
app.put('/api/messages/:id/read', authenticateToken, (req, res) => {
    const msgId = req.params.id;
    
    db.run(
        'UPDATE messages SET is_read = 1 WHERE id = ? AND recipient_id = ?',
        [msgId, req.user.id],
        function(err) {
            if (err) return res.status(500).json({ error: 'Server error' });
            res.json({ message: 'Message marked as read' });
        }
    );
});

// Delete message (sender only)
app.delete('/api/messages/:id', authenticateToken, (req, res) => {
    const msgId = req.params.id;

    db.run(
        'DELETE FROM messages WHERE id = ? AND sender_id = ?',
        [msgId, req.user.id],
        function(err) {
            if (err) return res.status(500).json({ error: 'Server error' });
            if (this.changes === 0) return res.status(404).json({ error: 'Message not found or not yours to delete' });
            res.json({ message: 'Message deleted' });
        }
    );
});

// ========== DASHBOARD ROUTES ==========

// Get dashboard stats (role-aware)
// ========== ROLE-BASED PROFILE / ME APIs ==========

// Get logged-in doctor's professional profile + server-computed stats
app.get('/api/doctors/me', authenticateToken, requireRole('doctor'), (req, res) => {
    const uid = req.user.id;
    db.get(
        `SELECT u.id, u.username, u.email, u.full_name, u.phone, u.specialty, u.photo,
                dp.qualification, dp.registration_number, dp.experience_years, dp.hospital, dp.bio,
                dp.languages, dp.consultation_fee, dp.availability, dp.verified
         FROM users u LEFT JOIN doctor_profiles dp ON dp.user_id = u.id WHERE u.id = ?`,
        [uid],
        (err, profile) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            if (!profile) return res.status(404).json({ error: 'Profile not found' });

            db.get('SELECT COUNT(*) as count FROM consultations WHERE doctor_id = ?', [uid], (e, totalC) => {
                db.get('SELECT COUNT(*) as count FROM consultations WHERE doctor_id = ? AND status = ?', [uid, 'completed'], (e2, resolved) => {
                    db.get(`SELECT COUNT(*) as count FROM (SELECT DISTINCT pu.user_id FROM consultations c JOIN patients pu ON c.patient_id = pu.id WHERE c.doctor_id = ?)`, [uid], (e3, patients) => {
                        db.get('SELECT AVG(rating) as avg, COUNT(*) as count FROM reviews WHERE doctor_id = ?', [uid], (e4, rev) => {
                            const today = new Date().toISOString().split('T')[0];
                            const upcomingQ = `SELECT COUNT(*) as count FROM consultations WHERE doctor_id = ? AND date(date) >= ? AND status IN ('pending','seen','accepted','in_progress')`;
                            db.get(upcomingQ, [uid, today], (e5, upcoming) => {
                                db.get('SELECT COUNT(*) as count FROM consultations WHERE doctor_id = ? AND date(date) = ? AND status != ? AND status != ?', [uid, today, 'cancelled', 'rejected'], (e6, todayA) => {
                                    db.get("SELECT COUNT(*) as count FROM consultations WHERE doctor_id = ? AND (status = 'pending' OR status = 'seen')", [uid], (e7, pendingA) => {
                                        db.get('SELECT COUNT(*) as count FROM messages WHERE recipient_id = ? AND is_read = 0', [uid], (e8, unread) => {
                                            res.json({
                                                ...profile,
                                                rating: rev && rev.avg ? Number(rev.avg.toFixed(1)) : null,
                                                review_count: rev ? rev.count : 0,
                                                total_consultations: totalC ? totalC.count : 0,
                                                problems_resolved: resolved ? resolved.count : 0,
                                                total_patients: patients ? patients.count : 0,
                                                upcoming_appointments: upcoming ? upcoming.count : 0,
                                                today_appointments: todayA ? todayA.count : 0,
                                                pending_appointments: pendingA ? pendingA.count : 0,
                                                unread_messages: unread ? unread.count : 0
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        }
    );
});

// Update logged-in doctor's professional profile (rating/verified/stats are NEVER client-editable)
app.put('/api/doctors/me', authenticateToken, requireRole('doctor'), (req, res) => {
    const uid = req.user.id;
    const allowed = ['qualification', 'registration_number', 'experience_years', 'hospital', 'bio', 'languages', 'consultation_fee', 'availability'];
    const clean = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) clean[k] = req.body[k]; });
    if (Object.keys(clean).length === 0) {
        return res.status(400).json({ error: 'No editable fields provided' });
    }
    const setSql = Object.keys(clean).map(k => `${k} = ?`).join(', ');
    const values = Object.values(clean);
    values.push(uid);
    db.run(
        `INSERT INTO doctor_profiles (user_id, ${Object.keys(clean).join(', ')}) VALUES (?, ${Object.keys(clean).map(() => '?').join(', ')})
         ON CONFLICT(user_id) DO UPDATE SET ${setSql}`,
        [uid, ...Object.values(clean)],
        function(err) {
            if (err) return res.status(500).json({ error: 'Server error' });
            logAction(uid, 'UPDATE', 'doctor_profiles', uid, clean, req.ip);
            res.json({ message: 'Profile updated successfully' });
        }
    );
});

// Upload doctor profile photo
app.post('/api/doctors/me/photo', authenticateToken, requireRole('doctor'), handlePhotoUpload, (req, res) => {
    const photoPath = 'uploads/profile-images/' + req.file.filename;
    db.get('SELECT photo FROM users WHERE id = ?', [req.user.id], (err, row) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        db.run('UPDATE users SET photo = ? WHERE id = ?', [photoPath, req.user.id], (err2) => {
            if (err2) return res.status(500).json({ error: 'Server error' });
            if (row && row.photo && row.photo !== photoPath) clearStoredPhoto(row.photo);
            logAction(req.user.id, 'UPDATE', 'users', req.user.id, { action: 'upload_photo' }, req.ip);
            res.json({ message: 'Profile photo updated successfully.', photo: photoPath });
        });
    });
});

// Remove doctor profile photo
app.delete('/api/doctors/me/photo', authenticateToken, requireRole('doctor'), (req, res) => {
    db.get('SELECT photo FROM users WHERE id = ?', [req.user.id], (err, row) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        db.run('UPDATE users SET photo = NULL WHERE id = ?', [req.user.id], (err2) => {
            if (err2) return res.status(500).json({ error: 'Server error' });
            if (row && row.photo) clearStoredPhoto(row.photo);
            logAction(req.user.id, 'UPDATE', 'users', req.user.id, { action: 'remove_photo' }, req.ip);
            res.json({ message: 'Profile photo removed successfully.' });
        });
    });
});

// Doctor: patients with a real relationship (consultation/appointment)
app.get('/api/doctors/me/patients', authenticateToken, requireRole('doctor'), (req, res) => {
    const uid = req.user.id;
    db.all(
        `SELECT p.*, u.full_name, u.email, u.phone, u.photo,
            (SELECT c.date FROM consultations c WHERE c.patient_id = p.id AND c.doctor_id = ? AND c.status != 'cancelled' ORDER BY c.date DESC, c.id DESC LIMIT 1) AS last_appointment_date,
            (SELECT c.status FROM consultations c WHERE c.patient_id = p.id AND c.doctor_id = ? AND c.status != 'cancelled' ORDER BY c.date DESC, c.id DESC LIMIT 1) AS appointment_status,
            (SELECT c.date FROM consultations c WHERE c.patient_id = p.id AND c.doctor_id = ? ORDER BY c.date DESC, c.id DESC LIMIT 1) AS last_consultation_date,
            (SELECT c.status FROM consultations c WHERE c.patient_id = p.id AND c.doctor_id = ? ORDER BY c.date DESC, c.id DESC LIMIT 1) AS consultation_status
         FROM patients p
         JOIN users u ON p.user_id = u.id
         WHERE p.user_id IN (SELECT DISTINCT pu.user_id FROM consultations c JOIN patients pu ON c.patient_id = pu.id WHERE c.doctor_id = ?)
         ORDER BY u.full_name`,
        [uid, uid, uid, uid, uid],
        (err, patients) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            res.json(patients);
        }
    );
});

// Doctor: own appointments (scheduled consultations)
app.get('/api/doctors/me/appointments', authenticateToken, requireRole('doctor'), (req, res) => {
    db.all(
        `SELECT c.*, pu.id as patient_user_id, pu.full_name as patient_name, pu.photo as patient_photo, pu.phone as patient_phone, pu.email as patient_email,
                u.full_name as doctor_name, u.specialty, u.photo as doctor_photo
         FROM consultations c
         JOIN patients p ON c.patient_id = p.id
         JOIN users pu ON p.user_id = pu.id
         JOIN users u ON c.doctor_id = u.id
         WHERE c.doctor_id = ?
         ORDER BY c.date DESC, c.appointment_time DESC`,
        [req.user.id],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            const result = (rows || []).map(a => serializeAppointment({ ...a, patient_table_id: a.patient_id }));
            res.json(result);
        }
    );
});

// Doctor: own consultations
app.get('/api/doctors/me/consultations', authenticateToken, requireRole('doctor'), (req, res) => {
    db.all(
        `SELECT c.*, pu.full_name as patient_name, pu.id as patient_user_id
         FROM consultations c
         JOIN patients p ON c.patient_id = p.id
         JOIN users pu ON p.user_id = pu.id
         WHERE c.doctor_id = ?
         ORDER BY c.created_at DESC`,
        [req.user.id],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            const result = (rows || []).map(c => ({
                ...c,
                vital_signs: c.vital_signs ? JSON.parse(c.vital_signs) : {},
                ai_suggestions: c.ai_suggestions ? JSON.parse(c.ai_suggestions) : []
            }));
            res.json(result);
        }
    );
});

// Doctor: reports of the doctor's related patients
app.get('/api/doctors/me/reports', authenticateToken, requireRole('doctor'), (req, res) => {
    db.all(
        `SELECT r.*, pu.full_name as patient_name
         FROM reports r
         JOIN patients p ON r.patient_id = p.id
         JOIN users pu ON p.user_id = pu.id
         WHERE p.user_id IN (SELECT DISTINCT pu2.user_id FROM consultations c JOIN patients pu2 ON c.patient_id = pu2.id WHERE c.doctor_id = ?)
         ORDER BY r.created_at DESC`,
        [req.user.id],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            res.json(rows);
        }
    );
});

// Admin: platform statistics (admin only)
// ========== ADMIN APIS (admin role only; role verified from DB by authenticateToken) ==========

// Dashboard statistics (all values computed from the database)
app.get('/api/admin/dashboard/stats', authenticateToken, requireRole('admin'), (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    const q = (sql, params, cb) => db.get(sql, params, (err, row) => cb(err ? 0 : (row ? row.count : 0)));

    q("SELECT COUNT(*) as count FROM users WHERE role = 'doctor'", [], (totalDoctors) => {
        q("SELECT COUNT(*) as count FROM users WHERE role = 'doctor' AND accountStatus = 'active'", [], (activeDoctors) => {
            q("SELECT COUNT(*) as count FROM users WHERE role = 'doctor' AND accountStatus = 'blocked'", [], (blockedDoctors) => {
                q("SELECT COUNT(*) as count FROM users WHERE role = 'doctor' AND accountStatus = 'deactivated'", [], (deactivatedDoctors) => {
                q("SELECT COUNT(*) as count FROM users WHERE role = 'doctor' AND accountStatus = 'deleted'", [], (deletedDoctors) => {
                q("SELECT COUNT(*) as count FROM users WHERE role = 'patient'", [], (totalPatients) => {
                    q("SELECT COUNT(*) as count FROM users WHERE role = 'patient' AND accountStatus = 'active'", [], (activePatients) => {
                        q("SELECT COUNT(*) as count FROM users WHERE role = 'patient' AND accountStatus = 'blocked'", [], (blockedPatients) => {
                            q("SELECT COUNT(*) as count FROM users WHERE role = 'patient' AND accountStatus = 'deactivated'", [], (deactivatedPatients) => {
                            q("SELECT COUNT(*) as count FROM users WHERE role = 'patient' AND accountStatus = 'deleted'", [], (deletedPatients) => {
                            q("SELECT COUNT(*) as count FROM users WHERE role = 'admin'", [], (totalAdmins) => {
                                q('SELECT COUNT(*) as count FROM users', [], (totalUsers) => {
                                    q('SELECT COUNT(*) as count FROM consultations', [], (totalAppointments) => {
                                        q("SELECT COUNT(*) as count FROM consultations WHERE status = 'pending'", [], (pendingAppointments) => {
                                            q("SELECT COUNT(*) as count FROM consultations WHERE status = 'completed'", [], (completedConsultations) => {
                                                q('SELECT COUNT(*) as count FROM reports', [], (totalReports) => {
                                                    q("SELECT COUNT(*) as count FROM reports WHERE date(created_at) = ?", [today], (reportsToday) => {
                                                        q('SELECT COUNT(*) as count FROM reports WHERE created_at >= ?', [weekAgo], (reportsWeek) => {
                                                            q('SELECT COUNT(*) as count FROM reports WHERE created_at >= ?', [monthStart], (reportsMonth) => {
                                                                db.all(`SELECT u.id, u.full_name, u.specialty, u.photo, u.accountStatus, u.created_at,
                                                                               (SELECT COUNT(*) FROM reviews WHERE doctor_id = u.id) as review_count,
                                                                               (SELECT AVG(rating) FROM reviews WHERE doctor_id = u.id) as rating
                                                                        FROM users u WHERE u.role = 'doctor' ORDER BY u.created_at DESC LIMIT 5`,
                                                                    [], (e1, recentDoctors) => {
                                                                    db.all(`SELECT p.id, p.user_id, u.full_name, u.email, u.phone, u.photo, u.accountStatus, u.created_at,
                                                                                   (SELECT COUNT(*) FROM consultations c WHERE c.patient_id = p.id) as appointment_count
                                                                            FROM patients p JOIN users u ON p.user_id = u.id ORDER BY u.created_at DESC LIMIT 5`,
                                                                        [], (e2, recentPatients) => {
                                                                        db.all(`SELECT c.id, c.date, c.appointment_time, c.status, pu.full_name as patient_name, u.full_name as doctor_name
                                                                                FROM consultations c
                                                                                JOIN patients p ON c.patient_id = p.id JOIN users pu ON p.user_id = pu.id
                                                                                JOIN users u ON c.doctor_id = u.id
                                                                                ORDER BY c.created_at DESC LIMIT 5`,
                                                                            [], (e3, recentAppointments) => {
                                                                            db.all(`SELECT c.id, c.date, c.status, c.diagnosis, pu.full_name as patient_name, u.full_name as doctor_name
                                                                                    FROM consultations c
                                                                                    JOIN patients p ON c.patient_id = p.id JOIN users pu ON p.user_id = pu.id
                                                                                    JOIN users u ON c.doctor_id = u.id
                                                                                    ORDER BY c.created_at DESC LIMIT 5`,
                                                                                [], (e4, recentConsultations) => {
                                                                                db.all(`SELECT r.id, r.file_name, r.report_type, r.created_at, pu.full_name as patient_name
                                                                                        FROM reports r JOIN patients p ON r.patient_id = p.id JOIN users pu ON p.user_id = pu.id
                                                                                        ORDER BY r.created_at DESC LIMIT 5`,
                                                                                    [], (e5, recentReports) => {
res.json({
                        total_doctors: totalDoctors, active_doctors: activeDoctors, blocked_doctors: blockedDoctors,
                        deactivated_doctors: deactivatedDoctors, deleted_doctors: deletedDoctors,
                        total_patients: totalPatients, active_patients: activePatients, blocked_patients: blockedPatients,
                        deactivated_patients: deactivatedPatients, deleted_patients: deletedPatients,
                        total_admins: totalAdmins, total_users: totalUsers,
                                                                                        total_appointments: totalAppointments, pending_appointments: pendingAppointments,
                                                                                        completed_consultations: completedConsultations,
                                                                                        total_reports: totalReports, reports_today: reportsToday, reports_week: reportsWeek, reports_month: reportsMonth,
                                                                                        recent_doctors: recentDoctors || [], recent_patients: recentPatients || [],
                                                                                        recent_appointments: recentAppointments || [], recent_consultations: recentConsultations || [],
                                                                                        recent_reports: recentReports || []
                                                                                    });
                                                                                });
                                                                            });
                                                                        });
                                                                    });
                                                                });
                                                            });
                                                        });
                                                    });
                                                });
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
});
    });
});
    });
});
    });
});
    });
});

// List doctors (search, filters, sort, pagination)
app.get('/api/admin/doctors', authenticateToken, requireRole('admin'), (req, res) => {
    const { search, specialty, verified, status, sort, order, page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    const offset = (pageNum - 1) * limitNum;

    const where = ["u.role = 'doctor'"];
    const params = [];
    if (search) {
        where.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.username LIKE ? OR u.specialty LIKE ?)');
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (specialty) { where.push('u.specialty LIKE ?'); params.push(`%${specialty}%`); }
    if (verified === '1' || verified === '0') { where.push('dp.verified = ?'); params.push(verified); }
    if (status && ['active', 'blocked', 'deactivated', 'deleted', 'pending'].includes(status)) {
        where.push('u.accountStatus = ?');
        params.push(status);
    } else {
        // Deleted accounts are hidden unless the admin explicitly filters for them.
        where.push("u.accountStatus != 'deleted'");
    }

    const sortCol = { created_at: 'u.created_at', rating: 'rating', experience: 'dp.experience_years', name: 'u.full_name' }[sort] || 'u.created_at';
    const sortDir = order === 'asc' ? 'ASC' : 'DESC';
    const whereSql = 'WHERE ' + where.join(' AND ');

    db.get(`SELECT COUNT(*) as count FROM users u LEFT JOIN doctor_profiles dp ON dp.user_id = u.id ${whereSql}`, params, (err, row) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        db.all(`SELECT u.id, u.username, u.email, u.full_name, u.phone, u.specialty, u.photo, u.created_at,
                       u.accountStatus, u.blockedAt, u.blockedBy, u.blockReason, u.lastLoginAt, u.deletedAt, u.deletedBy,
                       dp.qualification, dp.experience_years, dp.hospital, dp.verified,
                       (SELECT AVG(rating) FROM reviews WHERE doctor_id = u.id) as rating,
                       (SELECT COUNT(*) FROM reviews WHERE doctor_id = u.id) as review_count,
                       (SELECT COUNT(DISTINCT patient_id) FROM consultations WHERE doctor_id = u.id) as patient_count
                FROM users u LEFT JOIN doctor_profiles dp ON dp.user_id = u.id
                ${whereSql}
                ORDER BY ${sortCol} ${sortDir}
                LIMIT ? OFFSET ?`, [...params, limitNum, offset], (err2, doctors) => {
            if (err2) return res.status(500).json({ error: 'Server error' });
            res.json({ doctors: doctors || [], total: row ? row.count : 0, page: pageNum, limit: limitNum });
        });
    });
});

// Doctor detail
app.get('/api/admin/doctors/:id', authenticateToken, requireRole('admin'), (req, res) => {
    db.get(`SELECT u.id, u.username, u.email, u.full_name, u.phone, u.specialty, u.photo, u.created_at,
                   u.accountStatus, u.blockedAt, u.blockedBy, u.blockReason, u.lastLoginAt,
                   dp.qualification, dp.registration_number, dp.experience_years, dp.hospital, dp.bio, dp.languages,
                   dp.consultation_fee, dp.availability, dp.verified,
                   (SELECT AVG(rating) FROM reviews WHERE doctor_id = u.id) as rating,
                   (SELECT COUNT(*) FROM reviews WHERE doctor_id = u.id) as review_count,
                   (SELECT COUNT(DISTINCT patient_id) FROM consultations WHERE doctor_id = u.id) as patient_count,
                   (SELECT COUNT(*) FROM consultations WHERE doctor_id = u.id) as total_consultations,
                   (SELECT COUNT(*) FROM consultations WHERE doctor_id = u.id AND status = 'completed') as completed_consultations
            FROM users u LEFT JOIN doctor_profiles dp ON dp.user_id = u.id
            WHERE u.id = ? AND u.role = 'doctor'`, [req.params.id], (err, doctor) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
        res.json({ doctor });
    });
});

// Set account status helper (also logs audit)
function setAccountStatus(role, userId, status, adminId, reason, ip, res, successMessage) {
    const now = new Date().toISOString();
    const blocked = status === 'blocked';
    db.run(
        blocked
            ? 'UPDATE users SET accountStatus = ?, blockedAt = ?, blockedBy = ?, blockReason = ? WHERE id = ? AND role = ?'
            : 'UPDATE users SET accountStatus = ?, blockedAt = NULL, blockedBy = NULL, blockReason = NULL WHERE id = ? AND role = ?',
        blocked ? [status, now, adminId, reason || null, userId, role] : [status, userId, role],
        function (err) {
            if (err) return res.status(500).json({ error: 'Server error' });
            if (this.changes === 0) return res.status(404).json({ error: 'User not found or wrong role' });
            logAction(adminId, blocked ? 'BLOCK_USER' : 'UNBLOCK_USER', 'users', userId, { role, reason: reason || null }, ip);
            res.json({ message: successMessage, accountStatus: status });
        }
    );
}

app.put('/api/admin/doctors/:id/block', authenticateToken, requireRole('admin'), (req, res) => {
    if (Number(req.params.id) === Number(req.user.id)) return res.status(400).json({ error: 'You cannot block your own account' });
    setAccountStatus('doctor', req.params.id, 'blocked', req.user.id, req.body.reason, req.ip, res, 'Doctor blocked successfully.');
});

app.put('/api/admin/doctors/:id/unblock', authenticateToken, requireRole('admin'), (req, res) => {
    setAccountStatus('doctor', req.params.id, 'active', req.user.id, null, req.ip, res, 'Doctor unblocked successfully.');
});

// Verify / reject doctor verification
function setDoctorVerified(doctorId, verified, adminId, ip, res, message) {
    db.run(
        `INSERT INTO doctor_profiles (user_id, verified) VALUES (?, ?)
         ON CONFLICT(user_id) DO UPDATE SET verified = ?`,
        [doctorId, verified ? 1 : 0, verified ? 1 : 0],
        function (err) {
            if (err) return res.status(500).json({ error: 'Server error' });
            if (this.changes === 0) return res.status(404).json({ error: 'Doctor profile not found' });
            logAction(adminId, verified ? 'VERIFY_DOCTOR' : 'REJECT_DOCTOR', 'doctor_profiles', doctorId, {}, ip);
            res.json({ message, verified: verified ? 1 : 0 });
        }
    );
}

app.put('/api/admin/doctors/:id/verify', authenticateToken, requireRole('admin'), (req, res) => {
    setDoctorVerified(req.params.id, true, req.user.id, req.ip, res, 'Doctor verified successfully.');
});

app.put('/api/admin/doctors/:id/reject', authenticateToken, requireRole('admin'), (req, res) => {
    setDoctorVerified(req.params.id, false, req.user.id, req.ip, res, 'Doctor verification rejected.');
});

// List patients (search, filters, sort, pagination)
app.get('/api/admin/patients', authenticateToken, requireRole('admin'), (req, res) => {
    const { search, status, sort, order, page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    const offset = (pageNum - 1) * limitNum;

    const where = ["u.role = 'patient'"];
    const params = [];
    if (search) {
        where.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.username LIKE ? OR u.phone LIKE ?)');
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status && ['active', 'blocked', 'deactivated', 'deleted', 'pending'].includes(status)) {
        where.push('u.accountStatus = ?');
        params.push(status);
    } else {
        // Deleted accounts are hidden unless the admin explicitly filters for them.
        where.push("u.accountStatus != 'deleted'");
    }

    const sortCol = { created_at: 'u.created_at', name: 'u.full_name', appointments: 'appointment_count' }[sort] || 'u.created_at';
    const sortDir = order === 'asc' ? 'ASC' : 'DESC';
    const whereSql = 'WHERE ' + where.join(' AND ');

    db.get(`SELECT COUNT(*) as count FROM patients p JOIN users u ON p.user_id = u.id ${whereSql}`, params, (err, row) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        db.all(`SELECT u.id as id, p.id as patient_id, p.date_of_birth, p.gender, u.username, u.email, u.full_name, u.phone, u.photo, u.created_at,
                       u.accountStatus, u.blockedAt, u.blockedBy, u.blockReason, u.lastLoginAt, u.deletedAt, u.deletedBy,
                       (SELECT COUNT(*) FROM consultations c WHERE c.patient_id = p.id) as appointment_count
                FROM patients p JOIN users u ON p.user_id = u.id
                ${whereSql}
                ORDER BY ${sortCol} ${sortDir}
                LIMIT ? OFFSET ?`, [...params, limitNum, offset], (err2, patients) => {
            if (err2) return res.status(500).json({ error: 'Server error' });
            res.json({ patients: patients || [], total: row ? row.count : 0, page: pageNum, limit: limitNum });
        });
    });
});

// Patient detail
app.get('/api/admin/patients/:id', authenticateToken, requireRole('admin'), (req, res) => {
    db.get(`SELECT p.*, u.username, u.email, u.full_name, u.phone, u.photo, u.created_at,
                   u.accountStatus, u.blockedAt, u.blockedBy, u.blockReason, u.lastLoginAt,
                   (SELECT COUNT(*) FROM consultations c WHERE c.patient_id = p.id) as appointment_count,
                   (SELECT COUNT(*) FROM consultations c WHERE c.patient_id = p.id AND c.status = 'completed') as completed_count,
                   (SELECT COUNT(*) FROM reports r WHERE r.patient_id = p.id) as report_count
            FROM patients p JOIN users u ON p.user_id = u.id
            WHERE p.id = ? AND u.role = 'patient'`, [req.params.id], (err, patient) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!patient) return res.status(404).json({ error: 'Patient not found' });
        res.json({ patient });
    });
});

app.put('/api/admin/patients/:id/block', authenticateToken, requireRole('admin'), (req, res) => {
    setAccountStatus('patient', req.params.id, 'blocked', req.user.id, req.body.reason, req.ip, res, 'Patient blocked successfully.');
});

app.put('/api/admin/patients/:id/unblock', authenticateToken, requireRole('admin'), (req, res) => {
    setAccountStatus('patient', req.params.id, 'active', req.user.id, null, req.ip, res, 'Patient unblocked successfully.');
});

// ========== ACCOUNT MANAGEMENT (generic user routes, admin only) ==========
// These supersede the per-role block/unblock helpers above and add
// deactivate / reactivate / delete (soft) / restore / view-detail / bulk.

// Look up a user for account management; admin accounts are rejected explicitly.
function getUserForManagement(userId, cb) {
    db.get('SELECT id, username, email, full_name, role, accountStatus FROM users WHERE id = ?', [userId], cb);
}

function rejectIfSelfOrAdmin(targetUser, adminId, res) {
    if (targetUser.role === 'admin') {
        return res.status(403).json({ error: 'You cannot delete your own administrator account.' });
    }
    if (Number(targetUser.id) === Number(adminId)) {
        return res.status(403).json({ error: 'You cannot delete your own administrator account.' });
    }
    return null;
}

// Account status transition table: allowed "from" states, SQL, and audit action per target state.
const ACCOUNT_STATUS_TRANSITIONS = {
    block: {
        from: ['active', 'deactivated'],
        requires: 'blocked',
        result: 'blocked',
        action: 'BLOCK_USER',
        message: 'blocked',
        sql: "UPDATE users SET accountStatus = 'blocked', blockedAt = ?, blockedBy = ?, blockReason = ? WHERE id = ?",
        params: (now, adminId, reason, userId) => [now, adminId, reason || null, userId]
    },
    unblock: {
        from: ['blocked'],
        requires: 'blocked',
        result: 'active',
        action: 'UNBLOCK_USER',
        message: 'unblocked',
        sql: "UPDATE users SET accountStatus = 'active', blockedAt = NULL, blockedBy = NULL, blockReason = NULL WHERE id = ?",
        params: (now, adminId, reason, userId) => [userId]
    },
    deactivate: {
        from: ['active', 'blocked'],
        requires: 'deactivated',
        result: 'deactivated',
        action: 'DEACTIVATE_USER',
        message: 'deactivated',
        sql: "UPDATE users SET accountStatus = 'deactivated', blockedAt = NULL, blockedBy = NULL, blockReason = NULL WHERE id = ?",
        params: (now, adminId, reason, userId) => [userId]
    },
    reactivate: {
        from: ['deactivated'],
        requires: 'deactivated',
        result: 'active',
        action: 'REACTIVATE_USER',
        message: 'reactivated',
        sql: "UPDATE users SET accountStatus = 'active', blockedAt = NULL, blockedBy = NULL, blockReason = NULL WHERE id = ?",
        params: (now, adminId, reason, userId) => [userId]
    }
};

function setUserStatus(transition, userId, adminId, reason, ip, res, roleLabel) {
    const t = ACCOUNT_STATUS_TRANSITIONS[transition];
    if (!t) return res.status(400).json({ error: 'Invalid status transition' });
    getUserForManagement(userId, (err, user) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!user) return res.status(404).json({ error: 'User not found' });
        const selfCheck = rejectIfSelfOrAdmin(user, adminId, res);
        if (selfCheck) return;
        if (!t.from.includes(user.accountStatus)) {
            return res.status(409).json({ error: `Account is not ${t.requires}.` });
        }
        const now = new Date().toISOString();
        db.run(t.sql, t.params(now, adminId, reason, userId), function (e2) {
            if (e2) return res.status(500).json({ error: 'Server error' });
            if (this.changes === 0) return res.status(404).json({ error: 'User not found' });
            logAction(adminId, t.action, 'users', userId, { role: user.role, reason: reason || null, username: user.username }, ip);
            res.json({ message: `${roleLabel} account ${t.message} successfully.`, accountStatus: t.result });
        });
    });
}

// GET /api/admin/users/:id — full detail for a doctor or patient account
app.get('/api/admin/users/:id', authenticateToken, requireRole('admin'), (req, res) => {
    db.get(`SELECT u.id, u.username, u.email, u.full_name, u.phone, u.specialty, u.photo, u.role, u.accountStatus,
                   u.created_at, u.lastLoginAt, u.blockedAt, u.blockedBy, u.blockReason, u.deletedAt, u.deletedBy,
                   dp.qualification, dp.registration_number, dp.experience_years, dp.hospital, dp.bio, dp.languages,
                   dp.consultation_fee, dp.availability, dp.verified,
                   pt.date_of_birth, pt.gender, pt.address, pt.blood_type, pt.height, pt.weight, pt.emergency_contact,
                   (SELECT AVG(rating) FROM reviews WHERE doctor_id = u.id) as rating,
                   (SELECT COUNT(*) FROM reviews WHERE doctor_id = u.id) as review_count,
                   (SELECT COUNT(DISTINCT patient_id) FROM consultations WHERE doctor_id = u.id) as patient_count,
                   (SELECT COUNT(*) FROM consultations WHERE doctor_id = u.id) as total_consultations,
                   (SELECT COUNT(*) FROM consultations WHERE doctor_id = u.id AND status = 'completed') as completed_consultations,
                   (SELECT COUNT(*) FROM consultations c WHERE c.patient_id = pt.id) as appointment_count,
                   (SELECT COUNT(*) FROM consultations c WHERE c.patient_id = pt.id AND c.status = 'completed') as completed_count,
                   (SELECT COUNT(*) FROM reports r WHERE r.patient_id = pt.id) as report_count,
                   (SELECT COUNT(*) FROM prescriptions pr WHERE pr.patient_id = pt.id) as prescription_count,
                   (SELECT COUNT(*) FROM messages m WHERE m.recipient_id = u.id OR m.sender_id = u.id) as message_count
            FROM users u
            LEFT JOIN doctor_profiles dp ON dp.user_id = u.id
            LEFT JOIN patients pt ON pt.user_id = u.id
            WHERE u.id = ? AND u.role IN ('doctor','patient')`, [req.params.id], (err, user) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ user });
    });
});

// PATCH /api/admin/users/:id/block
app.patch('/api/admin/users/:id/block', authenticateToken, requireRole('admin'), (req, res) => {
    setUserStatus('block', req.params.id, req.user.id, req.body.reason, req.ip, res, req.body.roleLabel || 'User');
});

// PATCH /api/admin/users/:id/unblock
app.patch('/api/admin/users/:id/unblock', authenticateToken, requireRole('admin'), (req, res) => {
    setUserStatus('unblock', req.params.id, req.user.id, null, req.ip, res, req.body.roleLabel || 'User');
});

// PATCH /api/admin/users/:id/deactivate
app.patch('/api/admin/users/:id/deactivate', authenticateToken, requireRole('admin'), (req, res) => {
    setUserStatus('deactivate', req.params.id, req.user.id, req.body.reason, req.ip, res, req.body.roleLabel || 'User');
});

// PATCH /api/admin/users/:id/reactivate
app.patch('/api/admin/users/:id/reactivate', authenticateToken, requireRole('admin'), (req, res) => {
    setUserStatus('reactivate', req.params.id, req.user.id, req.body.reason, req.ip, res, req.body.roleLabel || 'User');
});

// DELETE /api/admin/users/:id — soft delete + anonymization (medical history preserved)
app.delete('/api/admin/users/:id', authenticateToken, requireRole('admin'), (req, res) => {
    const userId = req.params.id;
    getUserForManagement(userId, (err, user) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!user) return res.status(404).json({ error: 'User not found' });
        const selfCheck = rejectIfSelfOrAdmin(user, req.user.id, res);
        if (selfCheck) return;
        if (user.accountStatus === 'deleted') {
            return res.status(409).json({ error: 'Account is already deleted.' });
        }
        const now = new Date().toISOString();
        const anonymizedUsername = 'deleted_user_' + user.id;
        const anonymizedEmail = 'deleted_' + user.id + '@deleted.invalid';
        db.run(`UPDATE users SET
                    accountStatus = 'deleted', deletedAt = ?, deletedBy = ?,
                    originalUsername = ?, originalEmail = ?, originalFullName = ?,
                    username = ?, email = ?, full_name = 'Deleted User',
                    phone = NULL, photo = NULL, specialty = NULL
                 WHERE id = ?`,
            [now, req.user.id, user.username, user.email, user.full_name, anonymizedUsername, anonymizedEmail, userId],
            function (e2) {
                if (e2) return res.status(500).json({ error: 'Server error' });
                if (this.changes === 0) return res.status(404).json({ error: 'User not found' });
                // Best-effort cleanup of the uploaded profile photo file
                if (user.photo && user.photo.startsWith('uploads/')) {
                    const absolute = path.join(__dirname, user.photo);
                    if (absolute.startsWith(path.resolve(uploadsDir))) fs.unlink(absolute, () => {});
                }
                logAction(req.user.id, 'DELETE_USER', 'users', userId, { role: user.role, reason: req.body.reason || null, username: user.username }, req.ip);
                const label = user.role === 'doctor' ? 'Doctor' : 'Patient';
                res.json({ message: `${label} account deleted successfully.`, accountStatus: 'deleted' });
            }
        );
    });
});

// POST /api/admin/users/:id/restore — bring a soft-deleted account back
app.post('/api/admin/users/:id/restore', authenticateToken, requireRole('admin'), (req, res) => {
    db.get(`SELECT id, username, email, full_name, role, accountStatus, originalUsername, originalEmail, originalFullName
            FROM users WHERE id = ?`, [req.params.id], (err, user) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (user.role === 'admin') {
            return res.status(400).json({ error: 'Admin accounts are not managed through account management.' });
        }
        if (user.accountStatus !== 'deleted') {
            return res.status(409).json({ error: 'Only deleted accounts can be restored.' });
        }
        const restoredUsername = user.originalUsername || user.username;
        const restoredEmail = user.originalEmail || user.email;
        const restoredName = user.originalFullName || user.full_name;
        db.run(`UPDATE users SET
                    accountStatus = 'active', deletedAt = NULL, deletedBy = NULL,
                    originalUsername = NULL, originalEmail = NULL, originalFullName = NULL,
                    username = ?, email = ?, full_name = ?
                 WHERE id = ?`, [restoredUsername, restoredEmail, restoredName, user.id], function (e2) {
            if (e2) {
                if (/UNIQUE constraint failed/.test(e2.message)) {
                    return res.status(409).json({ error: 'Could not restore: the original username or email is already taken.' });
                }
                return res.status(500).json({ error: 'Server error' });
            }
            logAction(req.user.id, 'RESTORE_USER', 'users', user.id, { role: user.role, reason: req.body.reason || null, username: restoredUsername }, req.ip);
            res.json({ message: `${user.role === 'doctor' ? 'Doctor' : 'Patient'} account restored successfully.`, accountStatus: 'active' });
        });
    });
});

// POST /api/admin/users/bulk-deactivate — deactivate many accounts at once
app.post('/api/admin/users/bulk-deactivate', authenticateToken, requireRole('admin'), (req, res) => {
    const ids = Array.isArray(req.body.ids)
        ? req.body.ids.map(Number).filter(n => Number.isInteger(n) && n > 0)
        : [];
    if (!ids.length) return res.status(400).json({ error: 'No users selected.' });
    const placeholders = ids.map(() => '?').join(',');
    db.all(`SELECT id, role, accountStatus, username FROM users
            WHERE id IN (${placeholders}) AND role IN ('doctor','patient')`, ids, (err, users) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        const eligible = (users || []).filter(u => u.accountStatus === 'active' || u.accountStatus === 'blocked');
        if (!eligible.length) return res.status(409).json({ error: 'No eligible accounts to deactivate.' });
        const eIds = eligible.map(u => u.id);
        const ePh = eIds.map(() => '?').join(',');
        db.run(`UPDATE users SET accountStatus = 'deactivated', blockedAt = NULL, blockedBy = NULL, blockReason = NULL
                WHERE id IN (${ePh})`, eIds, function (e2) {
            if (e2) return res.status(500).json({ error: 'Server error' });
            eligible.forEach(u => {
                logAction(req.user.id, 'DEACTIVATE_USER', 'users', u.id, { role: u.role, reason: 'Bulk deactivation', username: u.username }, req.ip);
            });
            res.json({ message: `${eligible.length} account(s) deactivated successfully.`, deactivated: eligible.length, skipped: ids.length - eligible.length });
        });
    });
});

// All appointments (admin overview)
app.get('/api/admin/appointments', authenticateToken, requireRole('admin'), (req, res) => {
    const { filter, search } = req.query;
    const today = new Date().toISOString().split('T')[0];
    let where = 'WHERE 1=1';
    const params = [];
    if (filter === 'today') { where += ' AND date(c.date) = ?'; params.push(today); }
    if (filter === 'upcoming') { where += ' AND c.date >= ? AND c.status IN (?, ?, ?, ?)'; params.push(today, 'pending', 'seen', 'accepted', 'in_progress'); }
    if (filter && ['pending', 'seen', 'accepted', 'in_progress', 'completed', 'cancelled', 'rejected', 'follow_up'].includes(filter)) { where += ' AND c.status = ?'; params.push(filter); }
    if (search) { where += ' AND (pu.full_name LIKE ? OR u.full_name LIKE ? OR c.reason LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

    db.all(`SELECT c.*, pu.full_name as patient_name, u.full_name as doctor_name, pu.id as patient_user_id
            FROM consultations c
            JOIN patients p ON c.patient_id = p.id JOIN users pu ON p.user_id = pu.id
            JOIN users u ON c.doctor_id = u.id
            ${where}
            ORDER BY c.date DESC, c.appointment_time DESC LIMIT 500`, params, (err, appointments) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        res.json(appointments || []);
    });
});

// All consultations (admin overview)
app.get('/api/admin/consultations', authenticateToken, requireRole('admin'), (req, res) => {
    const { status, search } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (status && ['pending', 'seen', 'accepted', 'in_progress', 'completed', 'cancelled', 'rejected', 'follow_up'].includes(status)) { where += ' AND c.status = ?'; params.push(status); }
    if (search) { where += ' AND (pu.full_name LIKE ? OR u.full_name LIKE ? OR c.reason LIKE ? OR c.diagnosis LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`); }

    db.all(`SELECT c.*, pu.full_name as patient_name, u.full_name as doctor_name, pu.id as patient_user_id
            FROM consultations c
            JOIN patients p ON c.patient_id = p.id JOIN users pu ON p.user_id = pu.id
            JOIN users u ON c.doctor_id = u.id
            ${where}
            ORDER BY c.created_at DESC LIMIT 500`, params, (err, consultations) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        res.json(consultations || []);
    });
});

// Reports overview + totals
app.get('/api/admin/reports', authenticateToken, requireRole('admin'), (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const { search } = req.query;

    let where = 'WHERE 1=1';
    const params = [];
    if (search) { where += ' AND (pu.full_name LIKE ? OR r.file_name LIKE ? OR r.report_type LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

    const countQ = (sql, p, cb) => db.get(sql, p, (err, row) => cb(err ? 0 : (row ? row.count : 0)));

    countQ('SELECT COUNT(*) as count FROM reports', [], (total) => {
        countQ("SELECT COUNT(*) as count FROM reports WHERE date(created_at) = ?", [today], (todayCount) => {
            countQ('SELECT COUNT(*) as count FROM reports WHERE created_at >= ?', [weekAgo], (weekCount) => {
                countQ('SELECT COUNT(*) as count FROM reports WHERE created_at >= ?', [monthStart], (monthCount) => {
                    db.all(`SELECT r.*, pu.full_name as patient_name, u.full_name as doctor_name, pu.id as patient_user_id
                            FROM reports r
                            JOIN patients p ON r.patient_id = p.id JOIN users pu ON p.user_id = pu.id
                            LEFT JOIN users u ON r.uploaded_by = u.id
                            ${where}
                            ORDER BY r.created_at DESC LIMIT 500`, params, (err, reports) => {
                        if (err) return res.status(500).json({ error: 'Server error' });
                        res.json({
                            total: total, today: todayCount, week: weekCount, month: monthCount,
                            reports: reports || []
                        });
                    });
                });
            });
        });
    });
});

// Download report (admin)
app.get('/api/admin/reports/:id/download', authenticateToken, requireRole('admin'), (req, res) => {
    db.get('SELECT file_path, file_name FROM reports WHERE id = ?', [req.params.id], (err, report) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!report) return res.status(404).json({ error: 'Report not found' });
        res.download(path.join(__dirname, report.file_path), report.file_name || path.basename(report.file_path), (e) => {
            if (e && !res.headersSent) return res.status(500).json({ error: 'Download failed' });
        });
    });
});

// Delete report (admin, audit logged)
app.delete('/api/admin/reports/:id', authenticateToken, requireRole('admin'), (req, res) => {
    db.get('SELECT file_path FROM reports WHERE id = ?', [req.params.id], (err, report) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!report) return res.status(404).json({ error: 'Report not found' });
        db.run('DELETE FROM reports WHERE id = ?', [req.params.id], function (err2) {
            if (err2) return res.status(500).json({ error: 'Server error' });
            const fs = require('fs');
            fs.unlink(path.join(__dirname, report.file_path), () => {});
            logAction(req.user.id, 'DELETE', 'reports', req.params.id, {}, req.ip);
            res.json({ message: 'Report deleted' });
        });
    });
});

// All messages (admin overview)
app.get('/api/admin/messages', authenticateToken, requireRole('admin'), (req, res) => {
    const { search, unread } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (search) { where += ' AND (m.subject LIKE ? OR m.body LIKE ? OR u.full_name LIKE ? OR r.full_name LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`); }
    if (unread === '1') { where += ' AND m.is_read = 0'; }

    db.all(`SELECT m.*, u.full_name as sender_name, u.role as sender_role, r.full_name as recipient_name, r.role as recipient_role
            FROM messages m JOIN users u ON m.sender_id = u.id LEFT JOIN users r ON m.recipient_id = r.id
            ${where}
            ORDER BY m.created_at DESC LIMIT 500`, params, (err, messages) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        res.json(messages || []);
    });
});

// Admin profile
app.get('/api/admin/profile', authenticateToken, requireRole('admin'), (req, res) => {
    db.get('SELECT id, username, email, full_name, phone, photo, role, accountStatus, created_at, lastLoginAt FROM users WHERE id = ?', [req.user.id], (err, user) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ user });
    });
});

// Update admin profile (whitelist; role can never be changed)
app.put('/api/admin/profile', authenticateToken, requireRole('admin'), (req, res) => {
    const allowed = ['full_name', 'phone', 'email'];
    const clean = {};
    allowed.forEach(k => { if (req.body[k] !== undefined && req.body[k] !== null) clean[k] = String(req.body[k]).trim(); });
    if (Object.keys(clean).length === 0) return res.status(400).json({ error: 'No editable fields provided' });

    const setSql = Object.keys(clean).map(k => `${k} = ?`).join(', ');
    db.run(`UPDATE users SET ${setSql} WHERE id = ?`, [...Object.values(clean), req.user.id], (err) => {
        if (err) {
            if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Email already in use' });
            return res.status(500).json({ error: 'Server error' });
        }
        logAction(req.user.id, 'UPDATE', 'users', req.user.id, clean, req.ip);
        res.json({ message: 'Profile updated successfully' });
    });
});

// Admin profile photo
app.post('/api/admin/profile/photo', authenticateToken, requireRole('admin'), handlePhotoUpload, (req, res) => {
    const photoPath = 'uploads/profile-images/' + req.file.filename;
    db.get('SELECT photo FROM users WHERE id = ?', [req.user.id], (err, row) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        db.run('UPDATE users SET photo = ? WHERE id = ?', [photoPath, req.user.id], (err2) => {
            if (err2) return res.status(500).json({ error: 'Server error' });
            if (row && row.photo && row.photo !== photoPath) clearStoredPhoto(row.photo);
            logAction(req.user.id, 'UPDATE', 'users', req.user.id, { action: 'upload_photo' }, req.ip);
            res.json({ message: 'Profile photo updated successfully.', photo: photoPath });
        });
    });
});

// Remove admin profile photo
app.delete('/api/admin/profile/photo', authenticateToken, requireRole('admin'), (req, res) => {
    db.get('SELECT photo FROM users WHERE id = ?', [req.user.id], (err, row) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        db.run('UPDATE users SET photo = NULL WHERE id = ?', [req.user.id], (err2) => {
            if (err2) return res.status(500).json({ error: 'Server error' });
            if (row && row.photo) clearStoredPhoto(row.photo);
            logAction(req.user.id, 'UPDATE', 'users', req.user.id, { action: 'remove_photo' }, req.ip);
            res.json({ message: 'Profile photo removed successfully.' });
        });
    });
});

// Audit logs
app.get('/api/admin/audit-logs', authenticateToken, requireRole('admin'), (req, res) => {
    const { action, search, limit = 200 } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (action) { where += ' AND al.action = ?'; params.push(action); }
    if (search) { where += ' AND (u.full_name LIKE ? OR al.action LIKE ? OR al.details LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

    db.all(`SELECT al.*, u.full_name as admin_name, u.role as actor_role
            FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id
            ${where}
            ORDER BY al.created_at DESC LIMIT ?`, [...params, Math.min(1000, parseInt(limit) || 200)], (err, logs) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        res.json(logs || []);
    });
});

// Global admin search
app.get('/api/admin/search', authenticateToken, requireRole('admin'), (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ doctors: [], patients: [], appointments: [], consultations: [], reports: [] });
    const like = `%${q}%`;

    db.all(`SELECT u.id, u.full_name, u.specialty, u.accountStatus FROM users u WHERE u.role = 'doctor' AND u.accountStatus != 'deleted' AND (u.full_name LIKE ? OR u.email LIKE ? OR u.username LIKE ?) LIMIT 5`, [like, like, like], (e1, doctors) => {
        db.all(`SELECT p.id, u.id as user_id, u.full_name, u.email, u.accountStatus FROM patients p JOIN users u ON p.user_id = u.id WHERE u.role = 'patient' AND u.accountStatus != 'deleted' AND (u.full_name LIKE ? OR u.email LIKE ? OR u.username LIKE ? OR u.phone LIKE ?) LIMIT 5`, [like, like, like, like], (e2, patients) => {
            db.all(`SELECT c.id, c.date, c.status, pu.full_name as patient_name, u.full_name as doctor_name FROM consultations c JOIN patients p ON c.patient_id = p.id JOIN users pu ON p.user_id = pu.id JOIN users u ON c.doctor_id = u.id WHERE pu.full_name LIKE ? OR u.full_name LIKE ? OR c.reason LIKE ? LIMIT 5`, [like, like, like], (e3, appointments) => {
                db.all(`SELECT c.id, c.date, c.status, pu.full_name as patient_name, u.full_name as doctor_name FROM consultations c JOIN patients p ON c.patient_id = p.id JOIN users pu ON p.user_id = pu.id JOIN users u ON c.doctor_id = u.id WHERE pu.full_name LIKE ? OR u.full_name LIKE ? OR c.diagnosis LIKE ? LIMIT 5`, [like, like, like], (e4, consultations) => {
                    db.all(`SELECT r.id, r.file_name, r.report_type, r.created_at, pu.full_name as patient_name FROM reports r JOIN patients p ON r.patient_id = p.id JOIN users pu ON p.user_id = pu.id WHERE pu.full_name LIKE ? OR r.file_name LIKE ? OR r.report_type LIKE ? LIMIT 5`, [like, like, like], (e5, reports) => {
                        res.json({
                            doctors: doctors || [], patients: patients || [],
                            appointments: appointments || [], consultations: consultations || [],
                            reports: reports || []
                        });
                    });
                });
            });
        });
    });
});

// Legacy stats endpoint kept for compatibility
app.get('/api/admin/stats', authenticateToken, requireRole('admin'), (req, res) => {
    db.get('SELECT COUNT(*) as count FROM users WHERE role = ?', ['patient'], (e, patients) => {
        db.get('SELECT COUNT(*) as count FROM users WHERE role = ?', ['doctor'], (e2, doctors) => {
            db.get('SELECT COUNT(*) as count FROM consultations', (e3, consultations) => {
                db.get('SELECT COUNT(*) as count FROM consultations WHERE status = ?', ['completed'], (e4, completed) => {
                    db.get('SELECT COUNT(*) as count FROM messages', (e5, messages) => {
                        db.all(
                            `SELECT u.id, u.full_name, u.email, u.specialty, u.photo,
                                    dp.qualification, dp.verified,
                                    (SELECT AVG(rating) FROM reviews WHERE doctor_id = u.id) as rating,
                                    (SELECT COUNT(*) FROM reviews WHERE doctor_id = u.id) as review_count,
                                    (SELECT COUNT(*) FROM consultations WHERE doctor_id = u.id) as total_consultations
                             FROM users u LEFT JOIN doctor_profiles dp ON dp.user_id = u.id WHERE u.role = 'doctor' ORDER BY u.full_name`,
                            (e6, doctorRows) => {
                                if (e6) return res.status(500).json({ error: 'Server error' });
                                res.json({
                                    total_patients: patients ? patients.count : 0,
                                    total_doctors: doctors ? doctors.count : 0,
                                    total_consultations: consultations ? consultations.count : 0,
                                    completed_consultations: completed ? completed.count : 0,
                                    total_messages: messages ? messages.count : 0,
                                    doctors: doctorRows || []
                                });
                            }
                        );
                    });
                });
            });
        });
    });
});

app.get('/api/dashboard/stats', authenticateToken, (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const role = req.user.role;
    const isDoctor = role === 'doctor';
    const isAdmin = role === 'admin';
    const isPatient = role === 'patient';

    const doctorScope = (q) => isDoctor ? q.replace('WHERE', 'WHERE c.doctor_id = ? AND') : q;

    const finish = (todayAppts, pending, totalPatients, unread, recent) => {
        res.json({
            appointments_today: todayAppts?.count || 0,
            pending_appointments: pending?.count || 0,
            total_patients: totalPatients?.count || 0,
            unread_messages: unread?.count || 0,
            recent_appointments: recent || [],
            role
        });
    };

    let todayQ, pendingQ, patientQ, recentQ, recentParams;
    if (isDoctor || isAdmin) {
        todayQ = doctorScope('SELECT COUNT(*) as count FROM consultations c WHERE date(c.date) = ? AND c.status != "cancelled" AND c.status != "rejected"');
        pendingQ = doctorScope('SELECT COUNT(*) as count FROM consultations c WHERE (c.status = "pending" OR c.status = "seen")');
        patientQ = isDoctor
            ? `SELECT COUNT(*) as count FROM (SELECT DISTINCT pu.user_id FROM consultations c JOIN patients pu ON c.patient_id = pu.id WHERE c.doctor_id = ?)`
            : `SELECT COUNT(*) as count FROM patients p JOIN users u ON p.user_id = u.id WHERE u.role = 'patient'`;
        recentQ = isDoctor
            ? `SELECT c.*, pu.full_name as patient_name, u.full_name as doctor_name, pu.id as patient_user_id
               FROM consultations c
               JOIN patients p ON c.patient_id = p.id
               JOIN users pu ON p.user_id = pu.id
               JOIN users u ON c.doctor_id = u.id
               WHERE c.doctor_id = ?
               ORDER BY c.created_at DESC LIMIT 5`
            : `SELECT c.*, pu.full_name as patient_name, u.full_name as doctor_name, pu.id as patient_user_id
               FROM consultations c
               JOIN patients p ON c.patient_id = p.id
               JOIN users pu ON p.user_id = pu.id
               JOIN users u ON c.doctor_id = u.id
               ORDER BY c.created_at DESC LIMIT 5`;
    } else {
        todayQ = 'SELECT COUNT(*) as count FROM consultations c WHERE c.patient_id = (SELECT id FROM patients WHERE user_id = ?) AND date(c.date) = ? AND c.status != "cancelled"';
        pendingQ = 'SELECT COUNT(*) as count FROM consultations c WHERE c.patient_id = (SELECT id FROM patients WHERE user_id = ?) AND c.status = "pending"';
        patientQ = 'SELECT COUNT(*) as count FROM patients p JOIN users u ON p.user_id = u.id WHERE u.role = \'patient\'';
        recentQ = `SELECT c.*, u.full_name as doctor_name
                   FROM consultations c
                   JOIN users u ON c.doctor_id = u.id
                   WHERE c.patient_id = (SELECT id FROM patients WHERE user_id = ?)
                   ORDER BY c.created_at DESC LIMIT 5`;
    }

    const todayParams = isDoctor ? [req.user.id, today] : (isAdmin ? [today] : [req.user.id, today]);
    const pendingParams = isDoctor ? [req.user.id] : (isAdmin ? [] : [req.user.id]);
    const patientParams = isDoctor ? [req.user.id] : (isAdmin ? [] : []);
    recentParams = isDoctor ? [req.user.id] : (isAdmin ? [] : [req.user.id]);

    db.get(todayQ, todayParams, (err, todayAppts) => {
        db.get(pendingQ, pendingParams, (err, pending) => {
            db.get(patientQ, patientParams, (err, totalPatients) => {
                db.get('SELECT COUNT(*) as count FROM messages WHERE is_read = 0 AND recipient_id = ?', [req.user.id], (err, unread) => {
                    db.all(recentQ, recentParams, (err, recent) => {
                        finish(todayAppts, pending, totalPatients, unread, recent || []);
                    });
                });
            });
        });
    });
});

// Get consultations list (doctor: own; admin: all; patient: own) with filters
// Supports: ?date=today&status=&search=&patient_id=
app.get('/api/consultations', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const { date, status, search, patient_id } = req.query;
    const isDoctor = req.user.role === 'doctor';
    const isAdmin = req.user.role === 'admin';

    let where;
    const params = [];
    if (isDoctor) {
        where = 'WHERE c.doctor_id = ?';
        params.push(userId);
    } else if (isAdmin) {
        where = 'WHERE 1=1';
    } else {
        where = 'WHERE c.patient_id = (SELECT id FROM patients WHERE user_id = ?)';
        params.push(userId);
    }

    if (date === 'today') {
        where += ' AND date(c.date) = ?';
        params.push(new Date().toISOString().split('T')[0]);
    } else if (date) {
        where += ' AND date(c.date) = ?';
        params.push(date);
    }
    if (status) {
        where += ' AND c.status = ?';
        params.push(status);
    }
    if (patient_id) {
        where += ' AND c.patient_id = ?';
        params.push(patient_id);
    }
    if (search) {
        where += ' AND (pu.full_name LIKE ? OR c.reason LIKE ? OR c.symptoms LIKE ? OR c.diagnosis LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    db.all(
        `SELECT c.*, pu.full_name as patient_name, u.full_name as doctor_name, pu.id as patient_user_id
         FROM consultations c 
         JOIN patients p ON c.patient_id = p.id 
         JOIN users pu ON p.user_id = pu.id
         JOIN users u ON c.doctor_id = u.id 
         ${where}
         ORDER BY c.date DESC, c.created_at DESC`,
        params,
        (err, consultations) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            const result = consultations.map(c => ({
                ...c,
                vital_signs: c.vital_signs ? JSON.parse(c.vital_signs) : {},
                ai_suggestions: c.ai_suggestions ? JSON.parse(c.ai_suggestions) : []
            }));
            res.json(result);
        }
    );
});

// ========== APPOINTMENT ROUTES (scheduled consultations) ==========

// List appointments - supports ?date=today|YYYY-MM-DD&status=&patient_id=
app.get('/api/appointments', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const { date, status, patient_id } = req.query;
    const isDoctor = req.user.role === 'doctor';
    const isAdmin = req.user.role === 'admin';

    let where;
    const params = [];
    if (isDoctor) {
        where = 'WHERE c.doctor_id = ?';
        params.push(userId);
    } else if (isAdmin) {
        where = 'WHERE 1=1';
    } else {
        where = 'WHERE c.patient_id = (SELECT id FROM patients WHERE user_id = ?)';
        params.push(userId);
    }

    if (date === 'today') {
        where += ' AND date(c.date) = ?';
        params.push(new Date().toISOString().split('T')[0]);
    } else if (date) {
        where += ' AND date(c.date) = ?';
        params.push(date);
    }
    if (status) {
        where += ' AND c.status = ?';
        params.push(status);
    }
    if (patient_id) {
        where += ' AND c.patient_id = ?';
        params.push(patient_id);
    }

    db.all(
        `SELECT ${APPOINTMENT_SELECT}
         ${where}
         ORDER BY c.date DESC, c.appointment_time DESC, c.created_at DESC`,
        params,
        (err, appointments) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            res.json((appointments || []).map(serializeAppointment));
        }
    );
});

// Today's appointments
app.get('/api/appointments/today', authenticateToken, (req, res) => {
    req.query.date = 'today';
    const today = new Date().toISOString().split('T')[0];
    const isDoctor = req.user.role === 'doctor';
    const isAdmin = req.user.role === 'admin';

    let where = isDoctor ? 'WHERE c.doctor_id = ?' : (isAdmin ? 'WHERE 1=1' : 'WHERE c.patient_id = (SELECT id FROM patients WHERE user_id = ?)');
    const params = isDoctor ? [req.user.id] : (isAdmin ? [] : [req.user.id]);
    where += ' AND date(c.date) = ? AND c.status != "cancelled" AND c.status != "rejected"';
    params.push(today);

    db.all(
        `SELECT ${APPOINTMENT_SELECT}
         ${where} ORDER BY c.appointment_time ASC`,
        params,
        (err, appointments) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            res.json((appointments || []).map(serializeAppointment));
        }
    );
});

// Pending appointments
app.get('/api/appointments/pending', authenticateToken, (req, res) => {
    const isDoctor = req.user.role === 'doctor';
    const isAdmin = req.user.role === 'admin';

    let where = isDoctor ? 'WHERE c.doctor_id = ?' : (isAdmin ? 'WHERE 1=1' : 'WHERE c.patient_id = (SELECT id FROM patients WHERE user_id = ?)');
    const params = isDoctor ? [req.user.id] : (isAdmin ? [] : [req.user.id]);
    where += ' AND (c.status = "pending" OR c.status = "seen")';

    db.all(
        `SELECT ${APPOINTMENT_SELECT}
         ${where} ORDER BY c.date ASC, c.appointment_time ASC`,
        params,
        (err, appointments) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            res.json((appointments || []).map(serializeAppointment));
        }
    );
});

// Book a new appointment
app.post('/api/appointments', authenticateToken, (req, res) => {
    const { patient_id, doctor_id, appointment_date, appointment_time, reason } = req.body;

    if (!patient_id || !appointment_date) {
        return res.status(400).json({ error: 'patient_id and appointment_date are required' });
    }
    if (!isValidAppointmentDate(appointment_date)) {
        return res.status(400).json({ error: 'Appointment date cannot be in the past' });
    }

    resolvePatientId(patient_id, (err, pid) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!pid) return res.status(404).json({ error: 'Patient not found' });

        const isDoctor = req.user.role === 'doctor' || req.user.role === 'admin';

        // Patients may only book for themselves
        if (!isDoctor) {
            db.get('SELECT id FROM patients WHERE user_id = ?', [req.user.id], (err2, own) => {
                if (err2 || !own || own.id !== pid) {
                    return res.status(403).json({ error: 'You can only book appointments for yourself' });
                }
                insertAppointment();
            });
            return;
        }
        insertAppointment();

        function insertAppointment() {
            // The doctor requested for this appointment (validated below).
            // Patients always specify a doctor; doctor/admin bookings default to themselves.
            const requestedDoctorId = isDoctor ? (doctor_id || req.user.id) : doctor_id;

            // Validate the target doctor: must exist, be a doctor, and be active
            const validateDoctor = (cb) => {
                if (!requestedDoctorId) return cb(null, null);
                db.get(
                    "SELECT id FROM users WHERE id = ? AND role = 'doctor' AND accountStatus = 'active'",
                    [requestedDoctorId],
                    (err3, docRow) => {
                        if (err3) return cb(err3, null);
                        cb(null, docRow ? docRow.id : null);
                    }
                );
            };

            // Patient user id (for notification sender)
            const findPatientUserId = (cb) => {
                db.get('SELECT user_id FROM patients WHERE id = ?', [pid], (err5, pRow) => {
                    if (err5) return cb(err5, null);
                    cb(null, pRow ? pRow.user_id : null);
                });
            };

            findPatientUserId((errU, patientUserId) => {
                if (errU) return res.status(500).json({ error: 'Server error' });

                validateDoctor((errV, doctorId) => {
                    if (errV) return res.status(500).json({ error: 'Server error' });
                    if (!doctorId) {
                        return res.status(404).json({ error: isDoctor ? 'Doctor not found or inactive' : 'Selected doctor is unavailable. Please choose another doctor.' });
                    }

                    const finalStatus = isDoctor ? 'accepted' : 'pending';
                    db.run(
                        'INSERT INTO consultations (patient_id, doctor_id, date, appointment_time, reason, status) VALUES (?, ?, ?, ?, ?, ?)',
                        [pid, doctorId, appointment_date, appointment_time || null, reason || null, finalStatus],
                        function(err4) {
                            if (err4) return res.status(500).json({ error: 'Server error' });
                            logAction(req.user.id, 'CREATE', 'consultations', this.lastID, { type: 'appointment' }, req.ip);
                            const appointmentId = this.lastID;
                            // Notify the doctor about the new booking
                            notifyAppointment(patientUserId, doctorId, 'New appointment request',
                                `A new appointment has been requested for ${appointment_date}${appointment_time ? ' at ' + appointment_time : ''}.`);
                            res.status(201).json({ message: 'Appointment booked', appointment_id: appointmentId, status: finalStatus });
                        }
                    );
                });
            });
        }
    });
});

// Get appointment by ID (doctor viewing a pending appointment marks it as 'seen')
app.get('/api/appointments/:id', authenticateToken, (req, res) => {
    const id = req.params.id;

    db.get(
        `SELECT ${APPOINTMENT_SELECT}
         WHERE c.id = ?`,
        [id],
        (err, appointment) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

            canAccessConsultation(req.user, appointment, (allowed) => {
                if (!allowed) return res.status(403).json({ error: 'Insufficient permissions' });

                // Doctor viewing their assigned appointment: pending -> seen
                const isAssignedDoctor = req.user.role === 'doctor' && String(appointment.doctor_id) === String(req.user.id);
                if (isAssignedDoctor && appointment.status === 'pending') {
                    db.run(
                        "UPDATE consultations SET status = 'seen', seen_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'",
                        [id],
                        function(updErr) {
                            if (!updErr && this.changes > 0) {
                                logAction(req.user.id, 'UPDATE', 'consultations', id, { status: 'seen' }, req.ip);
                                notifyAppointment(req.user.id, appointment.patient_user_id, 'Appointment viewed',
                                    `Dr. ${appointment.doctor_name || 'Your doctor'} has viewed your appointment for ${appointment.date}.`);
                                appointment.status = 'seen';
                                appointment.seen_at = new Date().toISOString();
                            }
                            res.json(serializeAppointment(appointment));
                        }
                    );
                    return;
                }
                res.json(serializeAppointment(appointment));
            });
        }
    );
});

// Reschedule appointment
app.put('/api/appointments/:id', authenticateToken, (req, res) => {
    const id = req.params.id;
    const { appointment_date, appointment_time, reason } = req.body;

    db.get('SELECT * FROM consultations WHERE id = ?', [id], (err, existing) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!existing) return res.status(404).json({ error: 'Appointment not found' });
        if (existing.status === 'completed' || existing.status === 'cancelled' || existing.status === 'rejected') {
            return res.status(400).json({ error: `Cannot reschedule a ${existing.status} appointment` });
        }
        if (appointment_date && !isValidAppointmentDate(appointment_date)) {
            return res.status(400).json({ error: 'Appointment date cannot be in the past' });
        }

        canAccessConsultation(req.user, existing, (allowed) => {
            if (!allowed) return res.status(403).json({ error: 'Insufficient permissions' });

            db.run(
                'UPDATE consultations SET date = ?, appointment_time = ?, reason = ? WHERE id = ?',
                [appointment_date || existing.date, appointment_time ?? existing.appointment_time, reason ?? existing.reason, id],
                function(err) {
                    if (err) return res.status(500).json({ error: 'Server error' });
                    logAction(req.user.id, 'UPDATE', 'consultations', id, { action: 'reschedule' }, req.ip);
                    // Notify the other party about the reschedule
                    db.get('SELECT user_id FROM patients WHERE id = ?', [existing.patient_id], (errP, pRow) => {
                        const patientUserId = pRow ? pRow.user_id : null;
                        const recipient = req.user.role === 'doctor' || req.user.role === 'admin' ? patientUserId : existing.doctor_id;
                        if (recipient) {
                            notifyAppointment(req.user.id, recipient, 'Appointment rescheduled',
                                `Your appointment on ${appointment_date || existing.date}${appointment_time ? ' at ' + appointment_time : ''} has been rescheduled.`);
                        }
                        res.json({ message: 'Appointment rescheduled', appointment_id: id });
                    });
                }
            );
        });
    });
});

// Update appointment status (accept / reject / cancel / complete)
app.patch('/api/appointments/:id/status', authenticateToken, (req, res) => {
    const id = req.params.id;
    const { status, rejection_reason } = req.body;

    if (!status || !STATUS_TRANSITIONS[status]) {
        return res.status(400).json({ error: 'Invalid status' });
    }
    if (status === 'rejected' && !rejection_reason) {
        return res.status(400).json({ error: 'A rejection reason is required' });
    }

    db.get('SELECT * FROM consultations WHERE id = ?', [id], (err, existing) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!existing) return res.status(404).json({ error: 'Appointment not found' });

        if (!STATUS_TRANSITIONS[existing.status] || !STATUS_TRANSITIONS[existing.status].includes(status)) {
            return res.status(400).json({ error: `Cannot change status from '${existing.status}' to '${status}'` });
        }

        // Role gate: patients may only cancel; doctors act on their own appointments; admins can do anything
        if (req.user.role === 'patient' && status !== 'cancelled') {
            return res.status(403).json({ error: 'You can only cancel your appointment' });
        }
        if (req.user.role === 'doctor' && String(existing.doctor_id) !== String(req.user.id)) {
            return res.status(403).json({ error: 'You can only manage your own appointments' });
        }

        canAccessConsultation(req.user, existing, (allowed) => {
            if (!allowed) return res.status(403).json({ error: 'Insufficient permissions' });

            const tsCol = STATUS_TIMESTAMP_COLUMNS[status];
            const extraSets = [];
            const extraParams = [];
            if (tsCol) {
                extraSets.push(`${tsCol} = CURRENT_TIMESTAMP`);
            }
            if (status === 'cancelled') {
                extraSets.push('cancelled_by = ?');
                extraParams.push(req.user.role);
            }
            if (status === 'rejected') {
                extraSets.push('rejection_reason = ?');
                extraParams.push(rejection_reason);
            }
            const setSql = extraSets.length ? ', ' + extraSets.join(', ') : '';

            db.run(`UPDATE consultations SET status = ?${setSql} WHERE id = ?`, [status, ...extraParams, id], function(updErr) {
                if (updErr) return res.status(500).json({ error: 'Server error' });
                logAction(req.user.id, 'UPDATE', 'consultations', id, { appointment_status: status }, req.ip);

                // Notify the other party about the status change
                db.get('SELECT user_id FROM patients WHERE id = ?', [existing.patient_id], (errP, pRow) => {
                    const patientUserId = pRow ? pRow.user_id : null;
                    const isDoctorActor = req.user.role === 'doctor' || req.user.role === 'admin';
                    const recipient = isDoctorActor ? patientUserId : existing.doctor_id;
                    const statusMsgs = {
                        accepted: ['Appointment accepted', 'Your appointment has been confirmed by the doctor.'],
                        rejected: ['Appointment rejected', `Your appointment was rejected. Reason: ${rejection_reason}`],
                        cancelled: ['Appointment cancelled', 'An appointment was cancelled.'],
                        completed: ['Appointment completed', 'Your appointment has been marked as completed.']
                    };
                    const msg = statusMsgs[status];
                    if (recipient && msg) {
                        notifyAppointment(req.user.id, recipient, msg[0], msg[1]);
                    }
                    res.json({ message: 'Appointment updated', appointment_id: id, status });
                });
            });
        });
    });
});

// Start consultation from an appointment (doctor only)
app.post('/api/appointments/:id/start', authenticateToken, requireRole('doctor'), (req, res) => {
    const id = req.params.id;

    db.get('SELECT * FROM consultations WHERE id = ?', [id], (err, existing) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!existing) return res.status(404).json({ error: 'Appointment not found' });
        if (String(existing.doctor_id) !== String(req.user.id)) {
            return res.status(403).json({ error: 'You can only start your own appointments' });
        }
        if (!['pending', 'seen', 'accepted'].includes(existing.status)) {
            return res.status(400).json({ error: `Cannot start a ${existing.status} appointment` });
        }

        // Starting implies acceptance; record accepted_at if it was never accepted
        const acceptedSet = existing.status !== 'accepted' ? ', accepted_at = COALESCE(accepted_at, CURRENT_TIMESTAMP)' : '';
        db.run(`UPDATE consultations SET status = ?, date = ?, in_progress_at = CURRENT_TIMESTAMP${acceptedSet} WHERE id = ?`,
            ['in_progress', new Date().toISOString().split('T')[0], id],
            function(err2) {
                if (err2) return res.status(500).json({ error: 'Server error' });
                logAction(req.user.id, 'UPDATE', 'consultations', id, { action: 'start_consultation' }, req.ip);
                db.get('SELECT user_id FROM patients WHERE id = ?', [existing.patient_id], (errP, pRow) => {
                    if (pRow) {
                        notifyAppointment(req.user.id, pRow.user_id, 'Consultation started',
                            'Your consultation has started. You can join it now.');
                    }
                    res.json({ message: 'Consultation started', consultation_id: id, status: 'in_progress' });
                });
            }
        );
    });
});

// ========== PATIENT DASHBOARD ROUTES ==========

// Get patient's own consultations
app.get('/api/my/consultations', authenticateToken, (req, res) => {
    db.get(
        'SELECT id FROM patients WHERE user_id = ?',
        [req.user.id],
        (err, patient) => {
            if (err || !patient) return res.json([]);
            
            db.all(
                `SELECT c.*, u.full_name as doctor_name 
                 FROM consultations c JOIN users u ON c.doctor_id = u.id 
                 WHERE c.patient_id = ? ORDER BY c.created_at DESC`,
                [patient.id],
                (err, consultations) => {
                    if (err) return res.status(500).json({ error: 'Server error' });
                    const result = consultations.map(c => ({
                        ...c,
                        vital_signs: c.vital_signs ? JSON.parse(c.vital_signs) : {}
                    }));
                    res.json(result);
                }
            );
        }
    );
});

// ========== HOSPITAL SYSTEM ==========

// Generate unique hospital ID (e.g., HOS-XXXX)
function generateHospitalId() {
    return 'HOS-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
}

// Hospital admin middleware: checks if user is an admin/owner of a hospital
function requireHospitalAdmin(req, res, next) {
    if (req.user.role !== 'admin' && req.user.role !== 'hospital_admin') {
        return res.status(403).json({ error: 'Hospital admin access required' });
    }
    db.get('SELECT hospital_id FROM hospital_admins WHERE user_id = ?', [req.user.id], (err, ha) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!ha) return res.status(403).json({ error: 'Not associated with any hospital' });
        req.hospitalId = ha.hospital_id;
        next();
    });
}

// Helper: get hospital ID for a user (doctor, hospital_admin, etc.)
function getUserHospitalId(userId, cb) {
    db.get('SELECT hospital_id FROM hospital_admins WHERE user_id = ?', [userId], (err, ha) => {
        if (err) return cb(err, null);
        if (ha) return cb(null, ha.hospital_id);
        db.get('SELECT hospital_id FROM hospital_memberships WHERE doctor_id = ? AND status = ?', [userId, 'approved'], (err2, hm) => {
            if (err2) return cb(err2, null);
            cb(null, hm ? hm.hospital_id : null);
        });
    });
}

// Helper: create notification
function createNotification(userId, title, message, type, link) {
    db.run(
        'INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?)',
        [userId, title, message, type || 'info', link || null]
    );
}

// ========== HOSPITAL REGISTRATION ==========
app.post('/api/hospitals/register', (req, res) => {
    const {
        name, type, license_number, address, city, state, pincode,
        phone, email, admin_name, password, confirm_password
    } = req.body;

    if (!name || !type || !admin_name || !password || !confirm_password) {
        return res.status(400).json({ error: 'Missing required fields: name, type, admin_name, password, and confirm_password are required' });
    }
    if (password !== confirm_password) {
        return res.status(400).json({ error: 'Passwords do not match' });
    }
    const pwdErr = passwordPolicyError(password);
    if (pwdErr) return res.status(400).json({ error: pwdErr });

    const hospitalId = generateHospitalId();
    const hashedPassword = bcrypt.hashSync(password, 10);
    const adminUsername = 'hadmin_' + hospitalId.replace('HOS-', '').toLowerCase();

    // Create hospital admin user first
    db.run(
        'INSERT INTO users (username, email, password, role, full_name, phone) VALUES (?, ?, ?, ?, ?, ?)',
        [adminUsername, email || null, hashedPassword, 'hospital_admin', admin_name, phone || null],
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(409).json({ error: 'Username or email already exists' });
                }
                return res.status(400).json({ error: 'Registration failed' });
            }
            const adminUserId = this.lastID;

            // Create hospital
            db.run(
                `INSERT INTO hospitals (hospital_id, name, type, license_number, address, city, state, pincode, phone, email)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [hospitalId, name, type, license_number || null, address || null, city || null, state || null, pincode || null, phone || null, email || null],
                function(err2) {
                    if (err2) {
                        return res.status(500).json({ error: 'Failed to create hospital' });
                    }
                    const dbHospitalId = this.lastID;

                    // Link admin to hospital
                    db.run(
                        'INSERT INTO hospital_admins (hospital_id, user_id, is_owner) VALUES (?, ?, 1)',
                        [dbHospitalId, adminUserId],
                        function(err3) {
                            if (err3) {
                                return res.status(500).json({ error: 'Failed to link admin to hospital' });
                            }

                            const token = jwt.sign(
                                { id: adminUserId, role: 'hospital_admin', username: adminUsername },
                                process.env.JWT_SECRET,
                                { expiresIn: '24h' }
                            );
                            res.cookie('token', token, TOKEN_COOKIE_OPTIONS);

                            logAction(adminUserId, 'CREATE', 'hospitals', dbHospitalId, { hospital_id: hospitalId, name }, req.ip);

                            res.status(201).json({
                                success: true,
                                message: 'Hospital registered successfully',
                                token,
                                user: {
                                    id: adminUserId,
                                    username: adminUsername,
                                    email: email || null,
                                    role: 'hospital_admin',
                                    full_name: admin_name,
                                    phone: phone || null,
                                    photo: null,
                                    accountStatus: 'active'
                                },
                                hospital: {
                                    id: dbHospitalId,
                                    hospital_id: hospitalId,
                                    name,
                                    type,
                                    verification_status: 'pending'
                                }
                            });
                        }
                    );
                }
            );
        }
    );
});

// ========== HOSPITAL LOGIN ==========
app.post('/api/hospitals/login', (req, res) => {
    const { hospital_id, username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    db.get(
        'SELECT * FROM users WHERE (username = ? OR email = ?) AND role = ?',
        [username, username, 'hospital_admin'],
        async (err, user) => {
            if (err || !user) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            if (user.accountStatus !== 'active') {
                return res.status(403).json({ error: ACCOUNT_STATUS_MESSAGES[user.accountStatus] || 'Account not active' });
            }

            // Get associated hospital
            db.get('SELECT h.* FROM hospitals h JOIN hospital_admins ha ON h.id = ha.hospital_id WHERE ha.user_id = ?', [user.id], (err2, hospital) => {
                if (err2 || !hospital) {
                    return res.status(404).json({ error: 'No hospital associated with this account' });
                }

                const token = jwt.sign(
                    { id: user.id, role: 'hospital_admin', username: user.username, hospitalId: hospital.id },
                    process.env.JWT_SECRET,
                    { expiresIn: '24h' }
                );
                res.cookie('token', token, TOKEN_COOKIE_OPTIONS);

                db.run('UPDATE users SET lastLoginAt = ? WHERE id = ?', [new Date().toISOString(), user.id]);
                logAction(user.id, 'LOGIN', 'users', user.id, {}, req.ip);

                res.json({
                    success: true,
                    message: 'Login successful',
                    token,
                    user: {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        role: 'hospital_admin',
                        full_name: user.full_name,
                        phone: user.phone,
                        photo: user.photo || null,
                        accountStatus: user.accountStatus
                    },
                    hospital: {
                        id: hospital.id,
                        hospital_id: hospital.hospital_id,
                        name: hospital.name,
                        type: hospital.type,
                        verification_status: hospital.verification_status
                    }
                });
            });
        }
    );
});

// ========== HOSPITAL SEARCH (public) ==========
app.get('/api/hospitals/search', (req, res) => {
    const { q, city, type } = req.query;
    let where = "WHERE h.account_status = 'active'";
    const params = [];

    if (q) {
        where += ' AND (h.name LIKE ? OR h.hospital_id LIKE ? OR h.city LIKE ?)';
        params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (city) {
        where += ' AND h.city LIKE ?';
        params.push(`%${city}%`);
    }
    if (type) {
        where += ' AND h.type = ?';
        params.push(type);
    }

    db.all(
        `SELECT h.id, h.hospital_id, h.name, h.type, h.city, h.state, h.verification_status,
                (SELECT COUNT(*) FROM hospital_memberships hm WHERE hm.hospital_id = h.id AND hm.status = 'approved') as doctor_count,
                (SELECT COUNT(*) FROM departments d WHERE d.hospital_id = h.id) as department_count
         FROM hospitals h ${where} ORDER BY h.name LIMIT 50`,
        params,
        (err, hospitals) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            res.json(hospitals || []);
        }
    );
});

// ========== GET HOSPITAL BY ID ==========
app.get('/api/hospitals/:hospitalId', (req, res) => {
    db.get(
        `SELECT h.id, h.hospital_id, h.name, h.type, h.license_number, h.address, h.city, h.state, h.pincode,
                h.phone, h.email, h.logo, h.verification_status, h.created_at,
                (SELECT COUNT(*) FROM hospital_memberships hm WHERE hm.hospital_id = h.id AND hm.status = 'approved') as doctor_count
         FROM hospitals h WHERE h.hospital_id = ? OR h.id = ?`,
        [req.params.hospitalId, req.params.hospitalId],
        (err, hospital) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            if (!hospital) return res.status(404).json({ error: 'Hospital not found' });
            res.json(hospital);
        }
    );
});

// ========== HOSPITAL ADMIN: GET MY HOSPITAL PROFILE ==========
app.get('/api/hospital/my-hospital', authenticateToken, requireHospitalAdmin, (req, res) => {
    db.get('SELECT * FROM hospitals WHERE id = ?', [req.hospitalId], (err, hospital) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!hospital) return res.status(404).json({ error: 'Hospital not found' });
        res.json(hospital);
    });
});

// ========== HOSPITAL ADMIN: UPDATE HOSPITAL PROFILE ==========
app.put('/api/hospital/my-hospital', authenticateToken, requireHospitalAdmin, (req, res) => {
    const allowed = ['name', 'type', 'license_number', 'address', 'city', 'state', 'pincode', 'phone', 'email', 'logo'];
    const clean = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) clean[k] = req.body[k]; });
    if (Object.keys(clean).length === 0) return res.status(400).json({ error: 'No editable fields provided' });

    const setSql = Object.keys(clean).map(k => `${k} = ?`).join(', ');
    const values = Object.values(clean);
    values.push(req.hospitalId);

    db.run(`UPDATE hospitals SET ${setSql} WHERE id = ?`, values, function(err) {
        if (err) return res.status(500).json({ error: 'Server error' });
        logAction(req.user.id, 'UPDATE', 'hospitals', req.hospitalId, clean, req.ip);
        res.json({ message: 'Hospital profile updated successfully' });
    });
});

// ========== HOSPITAL ADMIN: GET DOCTORS ==========
app.get('/api/hospital/doctors', authenticateToken, requireHospitalAdmin, (req, res) => {
    const { status, search } = req.query;
    let where = 'WHERE hm.hospital_id = ?';
    const params = [req.hospitalId];

    if (status && ['pending', 'approved', 'rejected', 'suspended'].includes(status)) {
        where += ' AND hm.status = ?';
        params.push(status);
    }
    if (search) {
        where += ' AND (u.full_name LIKE ? OR u.email LIKE ? OR u.specialty LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    db.all(
        `SELECT hm.*, u.id as user_id, u.full_name, u.email, u.phone, u.specialty, u.photo,
                dp.qualification, dp.registration_number, dp.experience_years, dp.verified
         FROM hospital_memberships hm
         JOIN users u ON hm.doctor_id = u.id
         LEFT JOIN doctor_profiles dp ON dp.user_id = u.id
         ${where}
         ORDER BY u.full_name`,
        params,
        (err, doctors) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            res.json(doctors || []);
        }
    );
});

// ========== HOSPITAL ADMIN: GET JOIN REQUESTS ==========
app.get('/api/hospital/join-requests', authenticateToken, requireHospitalAdmin, (req, res) => {
    const { status } = req.query;
    let where = 'WHERE hjr.hospital_id = ?';
    const params = [req.hospitalId];

    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
        where += ' AND hjr.status = ?';
        params.push(status);
    } else {
        where += " AND hjr.status = 'pending'";
    }

    db.all(
        `SELECT hjr.*, u.full_name, u.email, u.phone, u.specialty, u.photo,
                dp.qualification, dp.registration_number, dp.experience_years
         FROM hospital_join_requests hjr
         JOIN users u ON hjr.doctor_id = u.id
         LEFT JOIN doctor_profiles dp ON dp.user_id = u.id
         ${where}
         ORDER BY hjr.created_at DESC`,
        params,
        (err, requests) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            res.json(requests || []);
        }
    );
});

// ========== HOSPITAL ADMIN: APPROVE/REJECT JOIN REQUEST ==========
app.patch('/api/hospital/join-requests/:id', authenticateToken, requireHospitalAdmin, (req, res) => {
    const requestId = req.params.id;
    const { action, rejection_reason, department } = req.body;

    if (!action || !['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Action must be approve or reject' });
    }

    db.get('SELECT * FROM hospital_join_requests WHERE id = ? AND hospital_id = ?', [requestId, req.hospitalId], (err, request) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!request) return res.status(404).json({ error: 'Join request not found' });
        if (request.status !== 'pending') return res.status(400).json({ error: 'Request already processed' });

        const newStatus = action === 'approve' ? 'approved' : 'rejected';

        db.run(
            'UPDATE hospital_join_requests SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, rejection_reason = ? WHERE id = ?',
            [newStatus, req.user.id, rejection_reason || null, requestId],
            function(err2) {
                if (err2) return res.status(500).json({ error: 'Server error' });

                if (action === 'approve') {
                    // Create or update membership
                    db.run(
                        `INSERT INTO hospital_memberships (hospital_id, doctor_id, status, department, approved_by, joined_at)
                         VALUES (?, ?, 'approved', ?, ?, CURRENT_TIMESTAMP)
                         ON CONFLICT(hospital_id, doctor_id) DO UPDATE SET status = 'approved', department = ?, approved_by = ?`,
                        [req.hospitalId, request.doctor_id, department || null, req.user.id, department || null, req.user.id],
                        function() {
                            // Update doctor's profile hospital field
                            db.get('SELECT name FROM hospitals WHERE id = ?', [req.hospitalId], (err3, hosp) => {
                                if (hosp) {
                                    db.run(
                                        `INSERT INTO doctor_profiles (user_id, hospital) VALUES (?, ?)
                                         ON CONFLICT(user_id) DO UPDATE SET hospital = ?`,
                                        [request.doctor_id, hosp.name, hosp.name]
                                    );
                                }
                            });
                            // Notify doctor
                            createNotification(request.doctor_id, 'Join Request Approved',
                                `Your request to join the hospital has been approved!`, 'success', '/doctor/dashboard');
                        }
                    );
                } else {
                    // Notify doctor of rejection
                    createNotification(request.doctor_id, 'Join Request Rejected',
                        `Your request to join the hospital was rejected. ${rejection_reason || ''}`, 'error', '/doctor/dashboard');
                }

                logAction(req.user.id, action === 'approve' ? 'APPROVE_DOCTOR' : 'REJECT_DOCTOR', 'hospital_join_requests', requestId, { doctor_id: request.doctor_id }, req.ip);
                res.json({ message: `Join request ${newStatus} successfully` });
            }
        );
    });
});

// ========== HOSPITAL ADMIN: DEPARTMENTS ==========
app.get('/api/hospital/departments', authenticateToken, requireHospitalAdmin, (req, res) => {
    db.all(
        `SELECT d.*, u.full_name as head_doctor_name
         FROM departments d
         LEFT JOIN users u ON d.head_doctor_id = u.id
         WHERE d.hospital_id = ?
         ORDER BY d.name`,
        [req.hospitalId],
        (err, departments) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            res.json(departments || []);
        }
    );
});

app.post('/api/hospital/departments', authenticateToken, requireHospitalAdmin, (req, res) => {
    const { name, description, head_doctor_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Department name is required' });

    db.run(
        'INSERT INTO departments (hospital_id, name, description, head_doctor_id) VALUES (?, ?, ?, ?)',
        [req.hospitalId, name, description || null, head_doctor_id || null],
        function(err) {
            if (err) return res.status(500).json({ error: 'Server error' });
            logAction(req.user.id, 'CREATE', 'departments', this.lastID, { name }, req.ip);
            res.status(201).json({ message: 'Department created', department_id: this.lastID });
        }
    );
});

app.put('/api/hospital/departments/:id', authenticateToken, requireHospitalAdmin, (req, res) => {
    const { name, description, head_doctor_id, is_active } = req.body;
    db.run(
        'UPDATE departments SET name = COALESCE(?, name), description = COALESCE(?, description), head_doctor_id = COALESCE(?, head_doctor_id), is_active = COALESCE(?, is_active) WHERE id = ? AND hospital_id = ?',
        [name || null, description || null, head_doctor_id || null, is_active !== undefined ? is_active : null, req.params.id, req.hospitalId],
        function(err) {
            if (err) return res.status(500).json({ error: 'Server error' });
            if (this.changes === 0) return res.status(404).json({ error: 'Department not found' });
            res.json({ message: 'Department updated' });
        }
    );
});

app.delete('/api/hospital/departments/:id', authenticateToken, requireHospitalAdmin, (req, res) => {
    db.run('DELETE FROM departments WHERE id = ? AND hospital_id = ?', [req.params.id, req.hospitalId], function(err) {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (this.changes === 0) return res.status(404).json({ error: 'Department not found' });
        res.json({ message: 'Department deleted' });
    });
});

// ========== HOSPITAL ADMIN: STAFF ==========
app.get('/api/hospital/staff', authenticateToken, requireHospitalAdmin, (req, res) => {
    db.all(
        'SELECT * FROM staff WHERE hospital_id = ? ORDER BY name',
        [req.hospitalId],
        (err, staff) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            res.json(staff || []);
        }
    );
});

app.post('/api/hospital/staff', authenticateToken, requireHospitalAdmin, (req, res) => {
    const { name, role, phone, email, department } = req.body;
    if (!name || !role) return res.status(400).json({ error: 'Name and role are required' });

    db.run(
        'INSERT INTO staff (hospital_id, name, role, phone, email, department) VALUES (?, ?, ?, ?, ?, ?)',
        [req.hospitalId, name, role, phone || null, email || null, department || null],
        function(err) {
            if (err) return res.status(500).json({ error: 'Server error' });
            logAction(req.user.id, 'CREATE', 'staff', this.lastID, { name, role }, req.ip);
            res.status(201).json({ message: 'Staff member added', staff_id: this.lastID });
        }
    );
});

app.delete('/api/hospital/staff/:id', authenticateToken, requireHospitalAdmin, (req, res) => {
    db.run('DELETE FROM staff WHERE id = ? AND hospital_id = ?', [req.params.id, req.hospitalId], function(err) {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (this.changes === 0) return res.status(404).json({ error: 'Staff not found' });
        res.json({ message: 'Staff removed' });
    });
});

// ========== HOSPITAL ADMIN: DASHBOARD STATS ==========
app.get('/api/hospital/dashboard/stats', authenticateToken, requireHospitalAdmin, (req, res) => {
    const q = (sql, params, cb) => db.get(sql, params, (err, row) => cb(err ? 0 : (row ? (row.count || row['COUNT(*)'] || 0) : 0)));

    q('SELECT COUNT(*) FROM hospital_memberships WHERE hospital_id = ? AND status = ?', [req.hospitalId, 'approved'], (totalDoctors) => {
        q('SELECT COUNT(*) FROM hospital_join_requests WHERE hospital_id = ? AND status = ?', [req.hospitalId, 'pending'], (pendingRequests) => {
            q('SELECT COUNT(*) FROM departments WHERE hospital_id = ?', [req.hospitalId], (totalDepartments) => {
                q('SELECT COUNT(*) FROM staff WHERE hospital_id = ?', [req.hospitalId], (totalStaff) => {
                    // Count patients seen by doctors in this hospital
                    db.get(
                        `SELECT COUNT(DISTINCT p.user_id) as count
                         FROM consultations c
                         JOIN patients p ON c.patient_id = p.id
                         WHERE c.doctor_id IN (
                             SELECT doctor_id FROM hospital_memberships WHERE hospital_id = ? AND status = 'approved'
                         )`,
                        [req.hospitalId],
                        (err, patRow) => {
                            const totalPatients = patRow ? patRow.count : 0;
                            q('SELECT COUNT(*) FROM consultations WHERE doctor_id IN (SELECT doctor_id FROM hospital_memberships WHERE hospital_id = ? AND status = ?)',
                                [req.hospitalId, 'approved'], (totalAppointments) => {
                                q('SELECT COUNT(*) FROM consultations WHERE doctor_id IN (SELECT doctor_id FROM hospital_memberships WHERE hospital_id = ? AND status = ?) AND status = ?',
                                    [req.hospitalId, 'approved', 'completed'], (completedAppointments) => {
                                    res.json({
                                        total_doctors: totalDoctors,
                                        pending_requests: pendingRequests,
                                        total_departments: totalDepartments,
                                        total_staff: totalStaff,
                                        total_patients: totalPatients,
                                        total_appointments: totalAppointments,
                                        completed_appointments: completedAppointments
                                    });
                                });
                            });
                        }
                    );
                });
            });
        });
    });
});

// ========== HOSPITAL ADMIN: PATIENTS (seen by hospital doctors) ==========
app.get('/api/hospital/patients', authenticateToken, requireHospitalAdmin, (req, res) => {
    db.all(
        `SELECT DISTINCT p.*, u.username, u.email, u.full_name, u.phone, u.photo
         FROM patients p
         JOIN users u ON p.user_id = u.id
         WHERE p.user_id IN (
             SELECT DISTINCT pu.user_id FROM consultations c
             JOIN patients pu ON c.patient_id = pu.id
             WHERE c.doctor_id IN (
                 SELECT doctor_id FROM hospital_memberships WHERE hospital_id = ? AND status = 'approved'
             )
         )
         ORDER BY u.full_name`,
        [req.hospitalId],
        (err, patients) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            res.json(patients || []);
        }
    );
});

// ========== HOSPITAL ADMIN: NOTIFICATIONS ==========
app.get('/api/hospital/notifications', authenticateToken, requireHospitalAdmin, (req, res) => {
    db.all(
        'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
        [req.user.id],
        (err, notifications) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            res.json(notifications || []);
        }
    );
});

app.patch('/api/hospital/notifications/:id/read', authenticateToken, requireHospitalAdmin, (req, res) => {
    db.run(
        'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
        [req.params.id, req.user.id],
        function(err) {
            if (err) return res.status(500).json({ error: 'Server error' });
            res.json({ message: 'Notification marked as read' });
        }
    );
});

// ========== ADMIN: HOSPITAL STATS ==========
app.get('/api/admin/hospital-stats', authenticateToken, requireRole('admin'), (req, res) => {
    const today = new Date();
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const thisYearStart = new Date(today.getFullYear(), 0, 1);
    
    db.all(
        'SELECT COUNT(*) AS total FROM hospitals',
        (err, row) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            const totalHospitals = row[0].total;
            
            db.all(
                'SELECT COUNT(*) AS verified FROM hospitals WHERE verification_status = ?',
                ['verified'],
                (err2, row2) => {
                    if (err2) return res.status(500).json({ error: 'Server error' });
                    
                    db.all(
                        'SELECT COUNT(*) AS pending FROM hospitals WHERE verification_status = ?',
                        ['pending'],
                        (err3, row3) => {
                            if (err3) return res.status(500).json({ error: 'Server error' });
                            
                            db.all(
                                'SELECT COUNT(*) AS total_users FROM users WHERE role = ?',
                                ['hospital_admin'],
                                (err4, row4) => {
                                    if (err4) return res.status(500).json({ error: 'Server error' });
                                    
                                    db.all(
                                        'SELECT COUNT(*) AS total_doctors FROM users WHERE role = ?',
                                        ['doctor'],
                                        (err5, row5) => {
                                            if (err5) return res.status(500).json({ error: 'Server error' });
                                            
                                            db.all(
                                                `SELECT COUNT(*) AS total_appointments FROM appointments WHERE date >= ?`,
                                                [thisMonthStart.toISOString().split('T')[0]],
                                                (err6, row6) => {
                                                    if (err6) return res.status(500).json({ error: 'Server error' });
                                                    
                                                    db.all(
                                                        `SELECT COUNT(*) AS completed_consultations FROM consultations WHERE status = 'completed'`,
                                                        (err7, row7) => {
                                                            if (err7) return res.status(500).json({ error: 'Server error' });
                                                            
                                                            res.json({
                                                                total_hospitals: totalHospitals,
                                                                verified_hospitals: row2[0].verified,
                                                                pending_hospitals: row3[0].pending,
                                                                total_hospital_admins: row4[0].total_users,
                                                                total_doctors: row5[0].total_doctors,
                                                                total_appointments_this_month: row6[0].total_appointments,
                                                                completed_consultations: row7[0].completed_consultations,
                                                                recent_hospitals: []
                                                            });
                                                        }
                                                    );
                                                }
                                            );
                                        }
                                    );
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});

// ========== DOCTOR: JOIN HOSPITAL ==========
app.post('/api/doctors/join-hospital', authenticateToken, requireRole('doctor'), (req, res) => {
    const { hospital_id, message } = req.body;
    if (!hospital_id) return res.status(400).json({ error: 'Hospital ID is required' });

    // Find hospital
    db.get('SELECT id, name FROM hospitals WHERE (hospital_id = ? OR id = ?) AND account_status = ?', [hospital_id, hospital_id, 'active'], (err, hospital) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (!hospital) return res.status(404).json({ error: 'Hospital not found' });

        // Check if already a member
        db.get('SELECT id FROM hospital_memberships WHERE hospital_id = ? AND doctor_id = ?', [hospital.id, req.user.id], (err2, existing) => {
            if (err2) return res.status(500).json({ error: 'Server error' });
            if (existing) return res.status(409).json({ error: 'Already a member of this hospital' });

            // Check if already has a pending request
            db.get('SELECT id FROM hospital_join_requests WHERE hospital_id = ? AND doctor_id = ? AND status = ?', [hospital.id, req.user.id, 'pending'], (err3, pending) => {
                if (err3) return res.status(500).json({ error: 'Server error' });
                if (pending) return res.status(409).json({ error: 'You already have a pending request for this hospital' });

                // Create join request
                db.run(
                    'INSERT INTO hospital_join_requests (hospital_id, doctor_id, message) VALUES (?, ?, ?)',
                    [hospital.id, req.user.id, message || null],
                    function(err4) {
                        if (err4) return res.status(500).json({ error: 'Server error' });

                        // Notify hospital admins
                        db.all('SELECT user_id FROM hospital_admins WHERE hospital_id = ?', [hospital.id], (err5, admins) => {
                            if (admins) {
                                admins.forEach(admin => {
                                    createNotification(admin.user_id, 'New Doctor Join Request',
                                        `Dr. ${req.user.username || req.user.id} has requested to join ${hospital.name}.`, 'info', '/hospital/dashboard');
                                });
                            }
                        });

                        logAction(req.user.id, 'CREATE', 'hospital_join_requests', this.lastID, { hospital_id: hospital.id }, req.ip);
                        res.status(201).json({ message: 'Join request sent successfully', request_id: this.lastID });
                    }
                );
            });
        });
    });
});

// ========== DOCTOR: GET MY HOSPITAL MEMBERSHIPS ==========
app.get('/api/doctors/my-hospitals', authenticateToken, requireRole('doctor'), (req, res) => {
    db.all(
        `SELECT hm.*, h.name as hospital_name, h.hospital_id as hospital_code, h.verification_status, h.city, h.state
         FROM hospital_memberships hm
         JOIN hospitals h ON hm.hospital_id = h.id
         WHERE hm.doctor_id = ?
         ORDER BY hm.created_at DESC`,
        [req.user.id],
        (err, memberships) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            res.json(memberships || []);
        }
    );
});

// ========== DOCTOR: GET MY JOIN REQUESTS ==========
app.get('/api/doctors/my-join-requests', authenticateToken, requireRole('doctor'), (req, res) => {
    db.all(
        `SELECT hjr.*, h.name as hospital_name, h.hospital_id as hospital_code
         FROM hospital_join_requests hjr
         JOIN hospitals h ON hjr.hospital_id = h.id
         WHERE hjr.doctor_id = ?
         ORDER BY hjr.created_at DESC`,
        [req.user.id],
        (err, requests) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            res.json(requests || []);
        }
    );
});

// ========== HOSPITAL: GET DOCTORS IN HOSPITAL (public) ==========
app.get('/api/hospitals/:hospitalId/doctors', (req, res) => {
    db.get('SELECT id FROM hospitals WHERE hospital_id = ?', [req.params.hospitalId], (err, hospital) => {
        if (err || !hospital) return res.status(404).json({ error: 'Hospital not found' });

        db.all(
            `SELECT u.id, u.full_name, u.specialty, u.photo, u.email, u.phone,
                    dp.qualification, dp.experience_years, dp.verified,
                    hm.department
             FROM hospital_memberships hm
             JOIN users u ON hm.doctor_id = u.id
             LEFT JOIN doctor_profiles dp ON dp.user_id = u.id
             WHERE hm.hospital_id = ? AND hm.status = 'approved'
             ORDER BY u.full_name`,
            [hospital.id],
            (err2, doctors) => {
                if (err2) return res.status(500).json({ error: 'Server error' });
                res.json(doctors || []);
            }
        );
    });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`AI Doctor Assistant server running on http://localhost:${PORT}`);
});

// Error handlers
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});
