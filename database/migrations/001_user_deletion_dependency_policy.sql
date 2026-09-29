-- =============================================================================
-- 001_user_deletion_dependency_policy.sql
--
-- Problem
-- -------
-- Every foreign key in the schema was created with the default ON DELETE NO
-- ACTION, so deleting a single user fails as soon as that user has touched
-- anything at all:
--
--   Unable to delete rows as one of them is currently referenced by a foreign
--   key constraint from table audit_logs.
--   Key (id)=(22) is still referenced from table audit_logs.
--
-- policy
-- ------
-- Deleting an account must remove the person's identity without destroying the
-- records that were created about them. Consultations, prescriptions, reports,
-- messages, reviews and audit entries are history: they stay, they simply stop
-- pointing at a user row that no longer exists.
--
--   ON DELETE SET NULL   the row is history or attribution - keep it, detach it
--   ON DELETE CASCADE    the row is private data owned by that one user, has no
--                        children of its own, and is meaningless without them
--
-- audit_logs is SET NULL and never CASCADE. An audit trail that vanishes with
-- the account it recorded is worthless as evidence.
--
-- CASCADE is used on patients.user_id, which owns a 1:1 profile, so the clinical
-- tables below it have to be detached in the same transaction - otherwise
-- deleting a patient would fail on consultations.patient_id instead.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Detach instead of reject: a column must be nullable before SET NULL is legal.
--    (departments.head_doctor_id, hospital_join_requests.reviewed_by,
--     hospital_memberships.approved_by, messages.recipient_id, reviews.patient_id,
--     reports.uploaded_by, staff.user_id, prescription_logs.patient_id,
--     medical_retrieval_logs.user_id and medical_sources.added_by are already
--     nullable and need nothing here.)
-- -----------------------------------------------------------------------------
ALTER TABLE audit_logs      ALTER COLUMN user_id      DROP NOT NULL;
ALTER TABLE consultations   ALTER COLUMN doctor_id    DROP NOT NULL;
ALTER TABLE consultations   ALTER COLUMN patient_id   DROP NOT NULL;
ALTER TABLE prescriptions   ALTER COLUMN doctor_id    DROP NOT NULL;
ALTER TABLE prescriptions   ALTER COLUMN patient_id   DROP NOT NULL;
ALTER TABLE reports         ALTER COLUMN patient_id   DROP NOT NULL;
ALTER TABLE medical_history ALTER COLUMN patient_id   DROP NOT NULL;
ALTER TABLE messages        ALTER COLUMN sender_id    DROP NOT NULL;
ALTER TABLE reviews         ALTER COLUMN doctor_id    DROP NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. audit_logs - the reason this migration exists.
--    The row, its action, timestamp, details and IP address all survive; only
--    the link to the user is cleared, leaving user_id IS NULL.
-- -----------------------------------------------------------------------------
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- 3. History and attribution pointing at users - preserved, detached.
-- -----------------------------------------------------------------------------
ALTER TABLE consultations DROP CONSTRAINT IF EXISTS consultations_doctor_id_fkey;
ALTER TABLE consultations ADD CONSTRAINT consultations_doctor_id_fkey
    FOREIGN KEY (doctor_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE prescriptions DROP CONSTRAINT IF EXISTS prescriptions_doctor_id_fkey;
ALTER TABLE prescriptions ADD CONSTRAINT prescriptions_doctor_id_fkey
    FOREIGN KEY (doctor_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
ALTER TABLE messages ADD CONSTRAINT messages_sender_id_fkey
    FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_recipient_id_fkey;
ALTER TABLE messages ADD CONSTRAINT messages_recipient_id_fkey
    FOREIGN KEY (recipient_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_doctor_id_fkey;
ALTER TABLE reviews ADD CONSTRAINT reviews_doctor_id_fkey
    FOREIGN KEY (doctor_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_patient_id_fkey;
ALTER TABLE reviews ADD CONSTRAINT reviews_patient_id_fkey
    FOREIGN KEY (patient_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_uploaded_by_fkey;
ALTER TABLE reports ADD CONSTRAINT reports_uploaded_by_fkey
    FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_head_doctor_id_fkey;
ALTER TABLE departments ADD CONSTRAINT departments_head_doctor_id_fkey
    FOREIGN KEY (head_doctor_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE hospital_join_requests DROP CONSTRAINT IF EXISTS hospital_join_requests_reviewed_by_fkey;
ALTER TABLE hospital_join_requests ADD CONSTRAINT hospital_join_requests_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE hospital_memberships DROP CONSTRAINT IF EXISTS hospital_memberships_approved_by_fkey;
ALTER TABLE hospital_memberships ADD CONSTRAINT hospital_memberships_approved_by_fkey
    FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE SET NULL;

-- staff.user_id is deliberately SET NULL, not CASCADE: the staff row is the
-- hospital's employment record and stays even when the linked login is gone.
ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_user_id_fkey;
ALTER TABLE staff ADD CONSTRAINT staff_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL;

-- Analytics and provenance are history too.
ALTER TABLE medical_retrieval_logs DROP CONSTRAINT IF EXISTS medical_retrieval_logs_user_id_fkey;
ALTER TABLE medical_retrieval_logs ADD CONSTRAINT medical_retrieval_logs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE medical_sources DROP CONSTRAINT IF EXISTS medical_sources_added_by_fkey;
ALTER TABLE medical_sources ADD CONSTRAINT medical_sources_added_by_fkey
    FOREIGN KEY (added_by) REFERENCES users (id) ON DELETE SET NULL;

-- These two are declared in schema.sql but were never created as real
-- constraints on the existing database, so nothing enforced them and both
-- columns can point at a user that no longer exists. Adding them with the same
-- rule keeps the live database consistent with a fresh install.
ALTER TABLE hospital_memberships DROP CONSTRAINT IF EXISTS hospital_memberships_ended_by_fkey;
ALTER TABLE hospital_memberships ADD CONSTRAINT hospital_memberships_ended_by_fkey
    FOREIGN KEY (ended_by) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE hospital_join_requests DROP CONSTRAINT IF EXISTS hospital_join_requests_invited_by_fkey;
ALTER TABLE hospital_join_requests ADD CONSTRAINT hospital_join_requests_invited_by_fkey
    FOREIGN KEY (invited_by) REFERENCES users (id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- 4. Data owned by exactly one user, with no children of its own.
-- -----------------------------------------------------------------------------
ALTER TABLE doctor_profiles DROP CONSTRAINT IF EXISTS doctor_profiles_user_id_fkey;
ALTER TABLE doctor_profiles ADD CONSTRAINT doctor_profiles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;

-- Unread badges for one user. Nothing outside that user's own screen reads them.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;

-- Reset tokens are single-use and expire; keeping one for a deleted account is
-- strictly worse than losing it.
ALTER TABLE password_resets DROP CONSTRAINT IF EXISTS password_resets_user_id_fkey;
ALTER TABLE password_resets ADD CONSTRAINT password_resets_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE hospital_admins DROP CONSTRAINT IF EXISTS hospital_admins_user_id_fkey;
ALTER TABLE hospital_admins ADD CONSTRAINT hospital_admins_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE hospital_memberships DROP CONSTRAINT IF EXISTS hospital_memberships_doctor_id_fkey;
ALTER TABLE hospital_memberships ADD CONSTRAINT hospital_memberships_doctor_id_fkey
    FOREIGN KEY (doctor_id) REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE hospital_join_requests DROP CONSTRAINT IF EXISTS hospital_join_requests_doctor_id_fkey;
ALTER TABLE hospital_join_requests ADD CONSTRAINT hospital_join_requests_doctor_id_fkey
    FOREIGN KEY (doctor_id) REFERENCES users (id) ON DELETE CASCADE;

-- -----------------------------------------------------------------------------
-- 5. patients.user_id is CASCADE - the profile belongs to that one user - which
--    means every clinical table under it has to be detached here, in the same
--    run, or the delete would just fail one level down.
--    These rows are the patient's medical record and are never deleted here.
-- -----------------------------------------------------------------------------
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_user_id_fkey;
ALTER TABLE patients ADD CONSTRAINT patients_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE consultations DROP CONSTRAINT IF EXISTS consultations_patient_id_fkey;
ALTER TABLE consultations ADD CONSTRAINT consultations_patient_id_fkey
    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE SET NULL;

ALTER TABLE medical_history DROP CONSTRAINT IF EXISTS medical_history_patient_id_fkey;
ALTER TABLE medical_history ADD CONSTRAINT medical_history_patient_id_fkey
    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE SET NULL;

ALTER TABLE prescriptions DROP CONSTRAINT IF EXISTS prescriptions_patient_id_fkey;
ALTER TABLE prescriptions ADD CONSTRAINT prescriptions_patient_id_fkey
    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE SET NULL;

ALTER TABLE prescription_logs DROP CONSTRAINT IF EXISTS prescription_logs_patient_id_fkey;
ALTER TABLE prescription_logs ADD CONSTRAINT prescription_logs_patient_id_fkey
    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE SET NULL;

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_patient_id_fkey;
ALTER TABLE reports ADD CONSTRAINT reports_patient_id_fkey
    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE SET NULL;
