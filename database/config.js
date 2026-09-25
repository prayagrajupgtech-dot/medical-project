const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || './database/medical.db';

// Ensure database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
    } else {
        console.log('Connected to SQLite database at:', dbPath);
    }
});

async function initDatabase() {
    const bcrypt = require('bcryptjs');
    
    return new Promise((resolve, reject) => {
        db.serialize(async () => {
            // Create all tables
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT CHECK(role IN ('doctor', 'patient', 'admin')) NOT NULL,
                full_name TEXT NOT NULL,
                phone TEXT,
                specialty TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // Rebuild users table if it still uses the old role CHECK (admin role missing)
            db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'", (err, row) => {
                const currentSql = row ? row.sql : '';
                if (currentSql && !currentSql.includes("'admin'")) {
                    db.run('ALTER TABLE users RENAME TO users_old', (err2) => {
                        if (err2) {
                            console.log('Users migration skipped:', err2.message);
                            return;
                        }
                        db.run(`CREATE TABLE users (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            username TEXT UNIQUE NOT NULL,
                            email TEXT UNIQUE NOT NULL,
                            password TEXT NOT NULL,
                            role TEXT CHECK(role IN ('doctor', 'patient', 'admin')) NOT NULL,
                            full_name TEXT NOT NULL,
                            phone TEXT,
                            specialty TEXT,
                            photo TEXT,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )`, () => {
                            db.run(`INSERT INTO users (id, username, email, password, role, full_name, phone, specialty, created_at)
                                    SELECT id, username, email, password, role, full_name, phone, specialty, created_at FROM users_old`, () => {
                                db.run('DROP TABLE users_old', (e3) => {
                                    console.log('Users table migrated to support admin role');
                                });
                            });
                        });
                    });
                }
            });

            db.run(`CREATE TABLE IF NOT EXISTS patients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                date_of_birth TEXT,
                gender TEXT CHECK(gender IN ('male', 'female', 'other')),
                address TEXT,
                emergency_contact TEXT,
                blood_type TEXT,
                height REAL,
                weight REAL,
                allergies TEXT,
                chronic_conditions TEXT,
                current_medications TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS medical_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id INTEGER NOT NULL,
                condition_name TEXT NOT NULL,
                diagnosed_date TEXT,
                severity TEXT,
                notes TEXT,
                FOREIGN KEY (patient_id) REFERENCES patients (id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS consultations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id INTEGER NOT NULL,
                doctor_id INTEGER NOT NULL,
                date TEXT NOT NULL,
                appointment_time TEXT,
                reason TEXT,
                symptoms TEXT,
                vital_signs TEXT,
                ai_suggestions TEXT,
                notes TEXT,
                diagnosis TEXT,
                status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'follow_up')),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES patients (id),
                FOREIGN KEY (doctor_id) REFERENCES users (id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id INTEGER NOT NULL,
                consultation_id INTEGER,
                file_name TEXT NOT NULL,
                file_path TEXT NOT NULL,
                file_type TEXT,
                file_size INTEGER,
                report_type TEXT,
                ai_analysis TEXT,
                important_values TEXT,
                uploaded_by INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES patients (id),
                FOREIGN KEY (consultation_id) REFERENCES consultations (id),
                FOREIGN KEY (uploaded_by) REFERENCES users (id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS prescriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                consultation_id INTEGER NOT NULL,
                patient_id INTEGER NOT NULL,
                doctor_id INTEGER NOT NULL,
                medication_name TEXT NOT NULL,
                dosage TEXT,
                frequency TEXT,
                duration TEXT,
                instructions TEXT,
                drug_interaction_alerts TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (consultation_id) REFERENCES consultations (id),
                FOREIGN KEY (patient_id) REFERENCES patients (id),
                FOREIGN KEY (doctor_id) REFERENCES users (id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS prescription_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id INTEGER,
                medication_name TEXT,
                dosage TEXT,
                frequency TEXT,
                duration TEXT,
                status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'cancelled')),
                start_date TEXT,
                end_date TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES patients (id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender_id INTEGER NOT NULL,
                recipient_id INTEGER,
                subject TEXT,
                body TEXT,
                priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
                is_read INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sender_id) REFERENCES users (id),
                FOREIGN KEY (recipient_id) REFERENCES users (id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                action TEXT NOT NULL,
                table_name TEXT,
                record_id INTEGER,
                details TEXT,
                ip_address TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS doctor_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL UNIQUE,
                qualification TEXT,
                registration_number TEXT,
                experience_years INTEGER,
                hospital TEXT,
                bio TEXT,
                languages TEXT,
                consultation_fee REAL,
                availability TEXT,
                verified INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                doctor_id INTEGER NOT NULL,
                patient_id INTEGER,
                rating INTEGER CHECK(rating BETWEEN 1 AND 5),
                comment TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (doctor_id) REFERENCES users (id),
                FOREIGN KEY (patient_id) REFERENCES users (id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS password_resets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                expires_at TEXT NOT NULL,
                used INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`);

            // ========== HOSPITAL SYSTEM TABLES ==========
            db.run(`CREATE TABLE IF NOT EXISTS hospitals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hospital_id TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                type TEXT CHECK(type IN ('government', 'private', 'clinic', 'other')) NOT NULL DEFAULT 'private',
                license_number TEXT,
                address TEXT,
                city TEXT,
                state TEXT,
                pincode TEXT,
                phone TEXT,
                email TEXT,
                logo TEXT,
                verification_status TEXT DEFAULT 'pending' CHECK(verification_status IN ('pending', 'verified', 'rejected', 'suspended')),
                account_status TEXT DEFAULT 'active' CHECK(account_status IN ('active', 'blocked', 'deactivated')),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS hospital_admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hospital_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                is_owner INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (hospital_id) REFERENCES hospitals (id),
                FOREIGN KEY (user_id) REFERENCES users (id),
                UNIQUE(hospital_id, user_id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS hospital_memberships (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hospital_id INTEGER NOT NULL,
                doctor_id INTEGER NOT NULL,
                status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'suspended')),
                department TEXT,
                joined_at DATETIME,
                approved_by INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (hospital_id) REFERENCES hospitals (id),
                FOREIGN KEY (doctor_id) REFERENCES users (id),
                FOREIGN KEY (approved_by) REFERENCES users (id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS hospital_join_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hospital_id INTEGER NOT NULL,
                doctor_id INTEGER NOT NULL,
                message TEXT,
                status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
                reviewed_by INTEGER,
                reviewed_at DATETIME,
                rejection_reason TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (hospital_id) REFERENCES hospitals (id),
                FOREIGN KEY (doctor_id) REFERENCES users (id),
                FOREIGN KEY (reviewed_by) REFERENCES users (id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS departments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hospital_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                head_doctor_id INTEGER,
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (hospital_id) REFERENCES hospitals (id),
                FOREIGN KEY (head_doctor_id) REFERENCES users (id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS staff (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hospital_id INTEGER NOT NULL,
                user_id INTEGER,
                name TEXT NOT NULL,
                role TEXT NOT NULL,
                phone TEXT,
                email TEXT,
                department TEXT,
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (hospital_id) REFERENCES hospitals (id),
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                type TEXT DEFAULT 'info' CHECK(type IN ('info', 'warning', 'success', 'error')),
                is_read INTEGER DEFAULT 0,
                link TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`);

            // Migrate users table to support new roles (hospital_admin, staff)
            db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'", (err, row) => {
                const currentSql = row ? row.sql : '';
                if (currentSql && !currentSql.includes("'hospital_admin'")) {
                    db.run('ALTER TABLE users RENAME TO users_old', (err2) => {
                        if (err2) {
                            console.log('Users role migration skipped:', err2.message);
                            return;
                        }
                        db.run(`CREATE TABLE users (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            username TEXT UNIQUE NOT NULL,
                            email TEXT UNIQUE NOT NULL,
                            password TEXT NOT NULL,
                            role TEXT CHECK(role IN ('doctor', 'patient', 'admin', 'hospital_admin', 'staff')) NOT NULL,
                            full_name TEXT NOT NULL,
                            phone TEXT,
                            specialty TEXT,
                            photo TEXT,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )`, () => {
                            db.run(`INSERT INTO users (id, username, email, password, role, full_name, phone, specialty, photo, created_at)
                                    SELECT id, username, email, password, role, full_name, phone, specialty, photo, created_at FROM users_old`, () => {
                                db.run('DROP TABLE users_old', (e3) => {
                                    console.log('Users table migrated to support hospital_admin and staff roles');
                                });
                            });
                        });
                    });
                }
            });

            // ----- Migrations for existing databases -----
            // Rebuild consultations table if it still uses the old status CHECK
            db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='consultations'", (err, row) => {
                const currentSql = row ? row.sql : '';
                const needsRebuild = !currentSql.includes("'pending'");
                const needsStatusRebuild = !currentSql.includes("'seen'") || !currentSql.includes("'rejected'");
                const hasTimeCol = currentSql.includes('appointment_time');

                const ensureColumns = (cb) => {
                    if (hasTimeCol) return cb();
                    db.run('ALTER TABLE consultations ADD COLUMN appointment_time TEXT', () => {
                        db.run('ALTER TABLE consultations ADD COLUMN reason TEXT', () => cb());
                    });
                };

                // Ensure appointment lifecycle timestamp columns exist, then migrate legacy statuses
                const afterTableReady = () => {
                    db.all("SELECT name FROM pragma_table_info('consultations')", (err2, cols) => {
                        if (err2 || !cols) { seed(); return; }
                        const addIfMissing = (name, sql) => {
                            if (!cols.some(c => c.name === name)) {
                                db.run('ALTER TABLE consultations ADD COLUMN ' + sql, () => {});
                            }
                        };
                        addIfMissing('seen_at', 'seen_at DATETIME');
                        addIfMissing('accepted_at', 'accepted_at DATETIME');
                        addIfMissing('in_progress_at', 'in_progress_at DATETIME');
                        addIfMissing('rejected_at', 'rejected_at DATETIME');
                        addIfMissing('cancelled_at', 'cancelled_at DATETIME');
                        addIfMissing('completed_at', 'completed_at DATETIME');
                        addIfMissing('cancelled_by', 'cancelled_by TEXT');
                        addIfMissing('rejection_reason', 'rejection_reason TEXT');
                        // Legacy 'confirmed' maps to the new 'accepted' status
                        db.run("UPDATE consultations SET status = 'accepted' WHERE status = 'confirmed'", () => seed());
                    });
                };

                if (needsStatusRebuild) {
                    db.run('ALTER TABLE consultations RENAME TO consultations_old', (err) => {
                        if (err) {
                            console.log('Consultations migration skipped:', err.message);
                            afterTableReady();
                            return;
                        }
                        db.run(`CREATE TABLE consultations (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            patient_id INTEGER NOT NULL,
                            doctor_id INTEGER NOT NULL,
                            date TEXT NOT NULL,
                            appointment_time TEXT,
                            reason TEXT,
                            symptoms TEXT,
                            vital_signs TEXT,
                            ai_suggestions TEXT,
                            notes TEXT,
                            diagnosis TEXT,
                            status TEXT DEFAULT 'pending' CHECK(status IN ('pending','seen','accepted','in_progress','completed','cancelled','rejected','follow_up')),
                            seen_at DATETIME,
                            in_progress_at DATETIME,
                            accepted_at DATETIME,
                            rejected_at DATETIME,
                            cancelled_at DATETIME,
                            completed_at DATETIME,
                            cancelled_by TEXT,
                            rejection_reason TEXT,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (patient_id) REFERENCES patients (id),
                            FOREIGN KEY (doctor_id) REFERENCES users (id)
                        )`, () => {
                            db.run(`INSERT INTO consultations (id, patient_id, doctor_id, date, appointment_time, reason, symptoms, vital_signs, ai_suggestions, notes, diagnosis, status, created_at)
                                    SELECT id, patient_id, doctor_id, date, appointment_time, reason, symptoms, vital_signs, ai_suggestions, notes, diagnosis,
                                           CASE status WHEN 'confirmed' THEN 'accepted' ELSE status END, created_at FROM consultations_old`, () => {
                                db.run('DROP TABLE consultations_old', () => {
                                    console.log('Consultations table migrated to appointment lifecycle statuses');
                                    afterTableReady();
                                });
                            });
                        });
                    });
                } else if (needsRebuild) {
                    db.run('ALTER TABLE consultations RENAME TO consultations_old', (err) => {
                        if (err) {
                            console.log('Consultations migration skipped:', err.message);
                            return seed();
                        }
                        db.run(`CREATE TABLE consultations (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            patient_id INTEGER NOT NULL,
                            doctor_id INTEGER NOT NULL,
                            date TEXT NOT NULL,
                            appointment_time TEXT,
                            reason TEXT,
                            symptoms TEXT,
                            vital_signs TEXT,
                            ai_suggestions TEXT,
                            notes TEXT,
                            diagnosis TEXT,
                            status TEXT DEFAULT 'pending' CHECK(status IN ('pending','seen','accepted','in_progress','completed','cancelled','rejected','follow_up')),
                            seen_at DATETIME,
                            in_progress_at DATETIME,
                            accepted_at DATETIME,
                            rejected_at DATETIME,
                            cancelled_at DATETIME,
                            completed_at DATETIME,
                            cancelled_by TEXT,
                            rejection_reason TEXT,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (patient_id) REFERENCES patients (id),
                            FOREIGN KEY (doctor_id) REFERENCES users (id)
                        )`, () => {
                            db.run(`INSERT INTO consultations (id, patient_id, doctor_id, date, symptoms, vital_signs, ai_suggestions, notes, diagnosis, status, created_at)
                                    SELECT id, patient_id, doctor_id, date, symptoms, vital_signs, ai_suggestions, notes, diagnosis, status, created_at FROM consultations_old`, () => {
                                db.run('DROP TABLE consultations_old', (err) => {
                                    console.log('Consultations table migrated to support appointment workflow');
                                    afterTableReady();
                                });
                            });
                        });
                    });
                } else {
                    ensureColumns(afterTableReady);
                }
            });

            function backfillProfiles() {
                // Add missing columns to users (photo, account status, blocking info, last login)
                db.all("SELECT name FROM pragma_table_info('users')", (err, cols) => {
                    if (err || !cols) return;
                    const addIfMissing = (name, sql) => {
                        if (!cols.some(c => c.name === name)) {
                            db.run('ALTER TABLE users ADD COLUMN ' + sql, (e) => {
                                if (e) console.log('users.' + name + ' migration skipped:', e.message);
                            });
                        }
                    };
                    addIfMissing('photo', 'photo TEXT');
                    addIfMissing('accountStatus', "accountStatus TEXT NOT NULL DEFAULT 'active'");
                    addIfMissing('blockedAt', 'blockedAt TEXT');
                    addIfMissing('blockedBy', 'blockedBy INTEGER');
                    addIfMissing('blockReason', 'blockReason TEXT');
                    addIfMissing('lastLoginAt', 'lastLoginAt TEXT');
                    addIfMissing('deletedAt', 'deletedAt TEXT');
                    addIfMissing('deletedBy', 'deletedBy INTEGER');
                    addIfMissing('originalUsername', 'originalUsername TEXT');
                    addIfMissing('originalEmail', 'originalEmail TEXT');
                    addIfMissing('originalFullName', 'originalFullName TEXT');
                    addIfMissing('preferredLanguage', "preferredLanguage TEXT DEFAULT 'en'");
                    addIfMissing('preferredLocale', "preferredLocale TEXT DEFAULT 'en-IN'");
                });

                // Backfill doctor_profiles rows for every doctor
                db.all('SELECT id FROM users WHERE role = ?', ['doctor'], (err, doctors) => {
                    if (err || !doctors) return;
                    doctors.forEach(d => {
                        db.run(
                            `INSERT OR IGNORE INTO doctor_profiles (user_id, qualification, registration_number, experience_years, hospital, bio, languages, consultation_fee, availability, verified)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                d.id,
                                d.id === 1 ? 'MD, Internal Medicine' : null,
                                d.id === 1 ? 'MCI-1847-9032' : null,
                                d.id === 1 ? 12 : 5,
                                d.id === 1 ? 'City General Hospital' : null,
                                d.id === 1 ? 'Board-certified physician with 12+ years of experience in internal medicine.' : null,
                                d.id === 1 ? 'English, Hindi' : 'English',
                                d.id === 1 ? 800 : 500,
                                d.id === 1 ? 'Mon-Fri 9:00-17:00' : 'By appointment',
                                1
                            ]
                        );
                    });
                });

                // Seed demo reviews only if the reviews table is completely empty
                db.get('SELECT COUNT(*) AS count FROM reviews', (err, row) => {
                    if (err || !row || row.count > 0) return;
                    db.all('SELECT id FROM users WHERE role = ? ORDER BY id LIMIT 3', ['doctor'], (err, doctors) => {
                        if (err || !doctors) return;
                        const ratings = [5, 4, 5, 5];
                        doctors.forEach(d => {
                            ratings.forEach((r, i) => {
                                db.run(
                                    'INSERT INTO reviews (doctor_id, patient_id, rating, comment) VALUES (?, NULL, ?, ?)',
                                    [d.id, r, i === 0 ? 'Very professional and thorough consultation.' : 'Great doctor, highly recommended.']
                                );
                            });
                        });
                        console.log('Demo reviews seeded.');
                    });
                });
            }

            function seedAdminIfMissing() {
                db.get('SELECT id FROM users WHERE role = ?', ['admin'], (err, adm) => {
                    if (err || adm) return;
                    const hashedAdminPassword = bcrypt.hashSync('admin123', 10);
                    db.run(
                        `INSERT INTO users (username, email, password, role, full_name, phone) 
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        ['admin', 'admin@aidoctorassistant.com', hashedAdminPassword, 'admin', 'System Administrator', '(555) 000-0000'],
                        (e2) => {
                            if (e2) console.log('Admin seed skipped:', e2.message);
                            else console.log('Default admin created. Login: admin / admin123');
                        }
                    );
                });
            }

            function seed() {
                backfillProfiles();
                seedAdminIfMissing();

                // Performance indexes for admin account management queries
                db.exec(`
                    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
                    CREATE INDEX IF NOT EXISTS idx_users_status ON users(accountStatus);
                    CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, accountStatus);
                    CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at);
                    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
                    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
                    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
                    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
                    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
                    CREATE INDEX IF NOT EXISTS idx_consultations_doctor ON consultations(doctor_id);
                    CREATE INDEX IF NOT EXISTS idx_consultations_patient ON consultations(patient_id);
                    CREATE INDEX IF NOT EXISTS idx_hospitals_id ON hospitals(hospital_id);
                    CREATE INDEX IF NOT EXISTS idx_hospital_memberships_hospital ON hospital_memberships(hospital_id);
                    CREATE INDEX IF NOT EXISTS idx_hospital_memberships_doctor ON hospital_memberships(doctor_id);
                    CREATE INDEX IF NOT EXISTS idx_hospital_memberships_status ON hospital_memberships(status);
                    CREATE INDEX IF NOT EXISTS idx_hospital_join_requests_hospital ON hospital_join_requests(hospital_id);
                    CREATE INDEX IF NOT EXISTS idx_hospital_join_requests_status ON hospital_join_requests(status);
                    CREATE INDEX IF NOT EXISTS idx_departments_hospital ON departments(hospital_id);
                    CREATE INDEX IF NOT EXISTS idx_staff_hospital ON staff(hospital_id);
                    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
                    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, is_read);
                `);

                // Default demo doctor seed is DISABLED (demo doctor/patient data was wiped by owner).
                // To re-enable, set SEED_DEFAULT_DOCTOR=true in .env
                if (process.env.SEED_DEFAULT_DOCTOR === 'true') {
                db.get('SELECT id FROM users WHERE username = ?', ['drjohnson'], (err, row) => {
                    if (!row) {
                        // Create default doctor with hashed password
                        const hashedPassword = bcrypt.hashSync('admin123', 10);
                        
                        db.run(
                            `INSERT INTO users (username, email, password, role, full_name, phone, specialty) 
                             VALUES (?, ?, ?, ?, ?, ?, ?)`,
                            ['drjohnson', 'dr@sarahjohnson.com', hashedPassword, 'doctor', 'Dr. Sarah Johnson', '(555) 123-4567', 'Internal Medicine'],
                            function(err) {
                                if (err) {
                                    console.error('Error seeding doctor:', err.message);
                                    return finishSeed();
                                }
                                console.log('Default doctor created. Login: drjohnson / admin123');
                                
                                // Create patient profile for doctor
                                db.run(
                                    'INSERT INTO patients (user_id) VALUES (?)',
                                    [this.lastID],
                                    () => finishSeed()
                                );
                            }
                        );
                    } else {
                        finishSeed();
                    }
                });
                } else {
                    finishSeed();
                }
            }

            function finishSeed() {
                // Seed demo clinical data only if consultations are empty
                db.get('SELECT COUNT(*) AS count FROM consultations', (err, row) => {
                    if (err) { console.log('Database initialized successfully'); return resolve(true); }
                    if (row.count > 0) {
                        console.log('Database already has consultations. Skipping demo seed.');
                        console.log('Database initialized successfully');
                        return resolve(true);
                    }

                    db.get('SELECT id FROM users WHERE role = ? ORDER BY id LIMIT 1', ['doctor'], (err, doctor) => {
                        if (err || !doctor) { console.log('Database initialized successfully'); return resolve(true); }

                        db.get('SELECT id FROM users WHERE role = ? AND username != ? ORDER BY id LIMIT 1', ['patient', 'drjohnson'], (err, patientUser) => {
                            if (err || !patientUser) {
                                console.log('Database initialized successfully');
                                return resolve(true);
                            }

                            db.get('SELECT id FROM patients WHERE user_id = ?', [patientUser.id], (err, patient) => {
                                if (err || !patient) { console.log('Database initialized successfully'); return resolve(true); }

                                const today = new Date();
                                const fmt = (d) => d.toISOString().split('T')[0];
                                const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
                                const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
                                const lastWeek = new Date(today); lastWeek.setDate(lastWeek.getDate() - 7);

                                const insertConsult = (status, date, time, reason, symptoms, diagnosis, cb) => {
                                    db.run(
                                        `INSERT INTO consultations (patient_id, doctor_id, date, appointment_time, reason, symptoms, status, diagnosis, created_at)
                                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                                        [patient.id, doctor.id, date, time, reason, symptoms, status, diagnosis],
                                        cb
                                    );
                                };

                                insertConsult('pending', fmt(tomorrow), '10:30', 'Follow-up blood pressure check', 'High blood pressure readings at home', null, () => {
                                    insertConsult('in_progress', fmt(today), '09:30', 'Routine check-up', 'Fatigue and occasional chest discomfort', null, () => {
                                        insertConsult('completed', fmt(lastWeek), '14:00', 'Annual physical', 'Routine physical examination', 'Healthy - no acute issues', () => {
                                            // Demo messages
                                            db.run(
                                                `INSERT INTO messages (sender_id, recipient_id, subject, body, priority, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                                                [doctor.id, patientUser.id, 'Lab results available', 'Your recent lab results are ready. Everything looks normal. Let us know if you have questions.', 'normal', 0],
                                                () => {
                                                    db.run(
                                                        `INSERT INTO messages (sender_id, recipient_id, subject, body, priority, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                                                        [patientUser.id, doctor.id, 'Appointment question', 'Can I move my appointment to the afternoon?', 'normal', 0],
                                                        () => {
                                                            db.run(
                                                                `INSERT INTO messages (sender_id, recipient_id, subject, body, priority, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                                                                [doctor.id, patientUser.id, 'Medication advice', 'Remember to take your medication with food as discussed.', 'normal', 0],
                                                                () => {
                                                                    // Demo medical history for the patient
                                                                    db.run(
                                                                        `INSERT INTO medical_history (patient_id, condition_name, diagnosed_date, severity, notes) VALUES (?, ?, ?, ?, ?)`,
                                                                        [patient.id, 'Hypertension', fmt(yesterday), 'Mild', 'Managed with lifestyle changes and medication'],
                                                                        () => {
                                                                            console.log('Demo data seeded successfully.');
                                                                            console.log('Database initialized successfully');
                                                                            resolve(true);
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
                                });
                            });
                        });
                    });
                });
            }

            // ── Medical Knowledge Base Tables ────────────────────────────────────
            db.run(`CREATE TABLE IF NOT EXISTS medical_sources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_type TEXT NOT NULL CHECK(source_type IN ('free','licensed','guideline','research','government')),
            source_name TEXT NOT NULL,
            author TEXT,
            publisher TEXT,
            edition TEXT,
            year INTEGER,
            license TEXT,
            url TEXT,
            copyright_status TEXT DEFAULT 'open',
            file_path TEXT,
            file_type TEXT,
            total_chunks INTEGER DEFAULT 0,
            indexed_at DATETIME,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending','indexing','indexed','failed','deleted')),
            error_message TEXT,
            added_by INTEGER REFERENCES users(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS medical_documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id INTEGER NOT NULL REFERENCES medical_sources(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            chapter TEXT,
            section TEXT,
            page_start INTEGER,
            page_end INTEGER,
            file_path TEXT,
            content TEXT NOT NULL,
            word_count INTEGER DEFAULT 0,
            chunk_count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending','processing','indexed','failed')),
            error_message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS medical_chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL REFERENCES medical_documents(id) ON DELETE CASCADE,
            source_id INTEGER NOT NULL REFERENCES medical_sources(id) ON DELETE CASCADE,
            chunk_index INTEGER NOT NULL,
            title TEXT,
            chapter TEXT,
            section TEXT,
            page_number INTEGER,
            content TEXT NOT NULL,
            word_count INTEGER DEFAULT 0,
            medical_topic TEXT,
            specialty TEXT,
            keywords TEXT,
            embedding TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS medical_topics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            category TEXT,
            description TEXT,
            parent_topic_id INTEGER REFERENCES medical_topics(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS medical_index_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id INTEGER REFERENCES medical_sources(id) ON DELETE CASCADE,
            document_id INTEGER REFERENCES medical_documents(id) ON DELETE CASCADE,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed')),
            total_items INTEGER DEFAULT 0,
            processed_items INTEGER DEFAULT 0,
            error_message TEXT,
            started_at DATETIME,
            completed_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS medical_retrieval_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER REFERENCES users(id),
            query TEXT NOT NULL,
            intent TEXT,
            topics TEXT,
            sources_retrieved TEXT,
            chunks_retrieved INTEGER DEFAULT 0,
            response_generated INTEGER DEFAULT 0,
            safety_flag INTEGER DEFAULT 0,
            latency_ms INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Performance indexes for medical knowledge
        db.run(`CREATE INDEX IF NOT EXISTS idx_medical_sources_type ON medical_sources(source_type)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_medical_sources_status ON medical_sources(status)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_medical_documents_source ON medical_documents(source_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_medical_chunks_source ON medical_chunks(source_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_medical_chunks_document ON medical_chunks(document_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_medical_chunks_topic ON medical_chunks(medical_topic)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_medical_chunks_specialty ON medical_chunks(specialty)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_medical_index_jobs_status ON medical_index_jobs(status)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_medical_retrieval_user ON medical_retrieval_logs(user_id)`);
        });
    });
}

module.exports = { db, initDatabase };
