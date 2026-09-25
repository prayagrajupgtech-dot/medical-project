-- Shrijal Medical Assistant — PostgreSQL schema (Supabase)
-- Mirrors the SQLite schema in database/config.js (final migrated state).
-- Safe to run multiple times (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT CHECK(role IN ('doctor', 'patient', 'admin', 'hospital_admin', 'staff')) NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    specialty TEXT,
    photo TEXT,
    accountStatus TEXT NOT NULL DEFAULT 'active',
    blockedAt TIMESTAMP,
    blockedBy INTEGER,
    blockReason TEXT,
    lastLoginAt TIMESTAMP,
    deletedAt TIMESTAMP,
    deletedBy INTEGER,
    originalUsername TEXT,
    originalEmail TEXT,
    originalFullName TEXT,
    preferredLanguage TEXT DEFAULT 'en',
    preferredLocale TEXT DEFAULT 'en-US',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS patients (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users (id),
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS medical_history (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients (id),
    condition_name TEXT NOT NULL,
    diagnosed_date TEXT,
    severity TEXT,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS consultations (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients (id),
    doctor_id INTEGER NOT NULL REFERENCES users (id),
    date TEXT NOT NULL,
    appointment_time TEXT,
    reason TEXT,
    symptoms TEXT,
    vital_signs TEXT,
    ai_suggestions TEXT,
    notes TEXT,
    diagnosis TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','seen','accepted','in_progress','completed','cancelled','rejected','follow_up')),
    seen_at TIMESTAMP,
    in_progress_at TIMESTAMP,
    accepted_at TIMESTAMP,
    rejected_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    completed_at TIMESTAMP,
    cancelled_by TEXT,
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients (id),
    consultation_id INTEGER REFERENCES consultations (id),
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT,
    file_size INTEGER,
    report_type TEXT,
    ai_analysis TEXT,
    important_values TEXT,
    uploaded_by INTEGER REFERENCES users (id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prescriptions (
    id SERIAL PRIMARY KEY,
    consultation_id INTEGER NOT NULL REFERENCES consultations (id),
    patient_id INTEGER NOT NULL REFERENCES patients (id),
    doctor_id INTEGER NOT NULL REFERENCES users (id),
    medication_name TEXT NOT NULL,
    dosage TEXT,
    frequency TEXT,
    duration TEXT,
    instructions TEXT,
    drug_interaction_alerts TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prescription_logs (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES patients (id),
    medication_name TEXT,
    dosage TEXT,
    frequency TEXT,
    duration TEXT,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'cancelled')),
    start_date TEXT,
    end_date TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES users (id),
    recipient_id INTEGER REFERENCES users (id),
    subject TEXT,
    body TEXT,
    priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
    is_read INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users (id),
    action TEXT NOT NULL,
    table_name TEXT,
    record_id INTEGER,
    details TEXT,
    ip_address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS doctor_profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users (id),
    qualification TEXT,
    registration_number TEXT,
    experience_years INTEGER,
    hospital TEXT,
    bio TEXT,
    languages TEXT,
    consultation_fee REAL,
    availability TEXT,
    verified INTEGER DEFAULT 0,
    -- Practice type: 'independent' (own clinic / no hospital) or 'hospital'
    practice_type TEXT DEFAULT 'independent',
    -- Own-clinic details (only used when practice_type = 'independent')
    clinic_name TEXT,
    clinic_address TEXT,
    clinic_city TEXT,
    clinic_state TEXT,
    clinic_pincode TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reviews (
    id SERIAL PRIMARY KEY,
    doctor_id INTEGER NOT NULL REFERENCES users (id),
    patient_id INTEGER REFERENCES users (id),
    rating INTEGER CHECK(rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_resets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users (id),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hospitals (
    id SERIAL PRIMARY KEY,
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hospital_admins (
    id SERIAL PRIMARY KEY,
    hospital_id INTEGER NOT NULL REFERENCES hospitals (id),
    user_id INTEGER NOT NULL REFERENCES users (id),
    is_owner INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(hospital_id, user_id)
);

CREATE TABLE IF NOT EXISTS hospital_memberships (
    id SERIAL PRIMARY KEY,
    hospital_id INTEGER NOT NULL REFERENCES hospitals (id),
    doctor_id INTEGER NOT NULL REFERENCES users (id),
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'suspended')),
    department TEXT,
    joined_at TIMESTAMP,
    approved_by INTEGER REFERENCES users (id),
    ended_at TIMESTAMP,
    ended_by INTEGER REFERENCES users (id),
    ended_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(hospital_id, doctor_id)
);

CREATE TABLE IF NOT EXISTS hospital_join_requests (
    id SERIAL PRIMARY KEY,
    hospital_id INTEGER NOT NULL REFERENCES hospitals (id),
    doctor_id INTEGER NOT NULL REFERENCES users (id),
    message TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    reviewed_by INTEGER REFERENCES users (id),
    reviewed_at TIMESTAMP,
    rejection_reason TEXT,
    -- 'doctor_request' = doctor asked to join, 'hospital_invitation' = hospital invited the doctor
    request_type TEXT DEFAULT 'doctor_request',
    department_id INTEGER,
    invited_by INTEGER REFERENCES users (id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    hospital_id INTEGER NOT NULL REFERENCES hospitals (id),
    name TEXT NOT NULL,
    description TEXT,
    head_doctor_id INTEGER REFERENCES users (id),
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS staff (
    id SERIAL PRIMARY KEY,
    hospital_id INTEGER NOT NULL REFERENCES hospitals (id),
    user_id INTEGER REFERENCES users (id),
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    department TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users (id),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info' CHECK(type IN ('info', 'warning', 'success', 'error')),
    is_read INTEGER DEFAULT 0,
    link TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS medical_sources (
    id SERIAL PRIMARY KEY,
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
    indexed_at TIMESTAMP,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','indexing','indexed','failed','deleted')),
    error_message TEXT,
    added_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS medical_documents (
    id SERIAL PRIMARY KEY,
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS medical_chunks (
    id SERIAL PRIMARY KEY,
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS medical_topics (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    category TEXT,
    description TEXT,
    parent_topic_id INTEGER REFERENCES medical_topics(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS medical_index_jobs (
    id SERIAL PRIMARY KEY,
    source_id INTEGER REFERENCES medical_sources(id) ON DELETE CASCADE,
    document_id INTEGER REFERENCES medical_documents(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed')),
    total_items INTEGER DEFAULT 0,
    processed_items INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS medical_retrieval_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    query TEXT NOT NULL,
    intent TEXT,
    topics TEXT,
    sources_retrieved TEXT,
    chunks_retrieved INTEGER DEFAULT 0,
    response_generated INTEGER DEFAULT 0,
    safety_flag INTEGER DEFAULT 0,
    latency_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Performance indexes
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
CREATE INDEX IF NOT EXISTS idx_medical_sources_type ON medical_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_medical_sources_status ON medical_sources(status);
CREATE INDEX IF NOT EXISTS idx_medical_documents_source ON medical_documents(source_id);
CREATE INDEX IF NOT EXISTS idx_medical_chunks_source ON medical_chunks(source_id);
CREATE INDEX IF NOT EXISTS idx_medical_chunks_document ON medical_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_medical_chunks_topic ON medical_chunks(medical_topic);
CREATE INDEX IF NOT EXISTS idx_medical_chunks_specialty ON medical_chunks(specialty);
CREATE INDEX IF NOT EXISTS idx_medical_index_jobs_status ON medical_index_jobs(status);
CREATE INDEX IF NOT EXISTS idx_medical_retrieval_user ON medical_retrieval_logs(user_id);
