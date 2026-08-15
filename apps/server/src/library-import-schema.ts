export const libraryImportSchemaSql = `
CREATE TABLE IF NOT EXISTS library_imports (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('new_library', 'existing_library')),
  repository_id bigint REFERENCES catalog_repositories(id),
  status text NOT NULL CHECK (status IN (
    'awaiting_upload', 'uploaded', 'validating', 'review_ready', 'invalid',
    'publishing', 'published_search_pending', 'published', 'publish_failed',
    'expired', 'canceled'
  )),
  upload_object_key text NOT NULL UNIQUE,
  upload_size bigint,
  uploader_clerk_user_id text NOT NULL CHECK (length(uploader_clerk_user_id) > 0),
  repository_key text,
  repository_name text,
  default_license text,
  license_url text,
  attribution_name text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  uploaded_at timestamptz,
  validation_started_at timestamptz,
  validation_completed_at timestamptz,
  quarantine_deleted_at timestamptz,
  expires_at timestamptz NOT NULL,
  CHECK (
    (kind = 'new_library' AND repository_id IS NULL)
    OR (kind = 'existing_library' AND repository_id IS NOT NULL)
  )
);
ALTER TABLE library_imports ADD COLUMN IF NOT EXISTS repository_key text;
ALTER TABLE library_imports ADD COLUMN IF NOT EXISTS repository_name text;
ALTER TABLE library_imports ADD COLUMN IF NOT EXISTS default_license text;
ALTER TABLE library_imports ADD COLUMN IF NOT EXISTS license_url text;
ALTER TABLE library_imports ADD COLUMN IF NOT EXISTS attribution_name text;
CREATE INDEX IF NOT EXISTS index_library_imports_on_status_expiry
  ON library_imports(status, expires_at);
CREATE INDEX IF NOT EXISTS index_library_imports_on_quarantine_cleanup
  ON library_imports(status, quarantine_deleted_at) WHERE quarantine_deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS library_import_files (
  import_id uuid NOT NULL REFERENCES library_imports(id) ON DELETE CASCADE,
  normalized_path text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN (
    'image/svg+xml', 'image/png', 'image/jpeg', 'application/json'
  )),
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  sha256 char(64) NOT NULL,
  quarantine_object_key text NOT NULL UNIQUE,
  sanitized boolean NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (import_id, normalized_path)
);

CREATE TABLE IF NOT EXISTS library_import_validation_results (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_id uuid NOT NULL REFERENCES library_imports(id) ON DELETE CASCADE,
  normalized_path text,
  code text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('error', 'warning')),
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS index_import_results_on_import
  ON library_import_validation_results(import_id, severity, id);

CREATE TABLE IF NOT EXISTS library_import_jobs (
  id uuid PRIMARY KEY,
  import_id uuid NOT NULL REFERENCES library_imports(id) ON DELETE CASCADE,
  job_type text NOT NULL CHECK (job_type IN ('validate')),
  actor_clerk_user_id text NOT NULL CHECK (length(actor_clerk_user_id) > 0),
  status text NOT NULL CHECK (status IN ('queued', 'leased', 'completed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL,
  lease_owner text,
  lease_expires_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (import_id, job_type),
  CHECK (
    (status = 'leased' AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status <> 'leased' AND lease_owner IS NULL AND lease_expires_at IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS index_import_jobs_on_claim
  ON library_import_jobs(status, available_at, lease_expires_at);

CREATE TABLE IF NOT EXISTS library_import_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_id uuid NOT NULL REFERENCES library_imports(id) ON DELETE CASCADE,
  actor_clerk_user_id text NOT NULL CHECK (length(actor_clerk_user_id) > 0),
  event_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS index_import_audit_on_import
  ON library_import_audit_events(import_id, id);
`
