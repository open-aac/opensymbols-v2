export const catalogSchemaSql = `
CREATE TABLE IF NOT EXISTS catalog_migration_runs (
  id uuid PRIMARY KEY,
  snapshot_id text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  source_postgresql_version text NOT NULL,
  source_fingerprint char(64) NOT NULL,
  source_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  reconciliation_count integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL,
  completed_at timestamptz
);
ALTER TABLE catalog_migration_runs
  ADD COLUMN IF NOT EXISTS source_fingerprint char(64);
ALTER TABLE catalog_migration_runs
  ALTER COLUMN source_fingerprint SET NOT NULL;

CREATE TABLE IF NOT EXISTS catalog_migration_reconciliations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  migration_run_id uuid NOT NULL REFERENCES catalog_migration_runs(id) ON DELETE CASCADE,
  source_table text NOT NULL,
  source_id bigint NOT NULL,
  field_path text NOT NULL,
  value_sha256 char(64) NOT NULL,
  action text NOT NULL CHECK (action = 'strip_embedded_nul'),
  result text NOT NULL
);
ALTER TABLE catalog_migration_reconciliations
  DROP CONSTRAINT IF EXISTS catalog_migration_reconciliations_result_check;
ALTER TABLE catalog_migration_reconciliations
  ADD CONSTRAINT catalog_migration_reconciliations_result_check
  CHECK (result IN ('normalized', 'kept_existing_clean_key'));

CREATE TABLE IF NOT EXISTS catalog_repositories (
  id bigint PRIMARY KEY,
  migration_run_id uuid NOT NULL REFERENCES catalog_migration_runs(id) ON DELETE CASCADE,
  repo_key text NOT NULL UNIQUE,
  name text,
  description text,
  website_url text,
  active boolean NOT NULL,
  protected boolean NOT NULL,
  repository_type text,
  symbol_count integer,
  protected_symbol_count integer,
  attribution_license text,
  attribution_license_url text,
  attribution_author_name text,
  attribution_author_url text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_repository_modifiers (
  id bigint PRIMARY KEY,
  migration_run_id uuid NOT NULL REFERENCES catalog_migration_runs(id) ON DELETE CASCADE,
  repository_id bigint NOT NULL REFERENCES catalog_repositories(id) ON DELETE CASCADE,
  repo_key text NOT NULL,
  locale text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (repository_id, locale)
);

CREATE TABLE IF NOT EXISTS catalog_repository_defaults (
  migration_run_id uuid NOT NULL REFERENCES catalog_migration_runs(id) ON DELETE CASCADE,
  repository_id bigint NOT NULL REFERENCES catalog_repositories(id) ON DELETE CASCADE,
  repository_modifier_id bigint REFERENCES catalog_repository_modifiers(id) ON DELETE CASCADE,
  locale text NOT NULL,
  search_term text NOT NULL,
  symbol_key text NOT NULL,
  PRIMARY KEY (repository_id, locale, search_term)
);

CREATE TABLE IF NOT EXISTS catalog_symbols (
  id bigint PRIMARY KEY,
  migration_run_id uuid NOT NULL REFERENCES catalog_migration_runs(id) ON DELETE CASCADE,
  repository_id bigint NOT NULL REFERENCES catalog_repositories(id) ON DELETE CASCADE,
  symbol_key text NOT NULL,
  name text,
  description text,
  row_enabled boolean,
  settings_enabled boolean,
  row_has_skin boolean,
  settings_has_skin boolean,
  has_variants boolean,
  has_white boolean,
  row_unsafe boolean,
  settings_unsafe boolean,
  protected boolean,
  protected_symbol boolean,
  random_order integer,
  random_weight double precision,
  image_url text,
  file_extension text,
  license text,
  license_url text,
  author text,
  author_url text,
  source_url text,
  emoji text,
  prior_image_url text,
  prior_file_extension text,
  skin_flood double precision,
  search_string text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (repository_id, symbol_key)
);
CREATE INDEX IF NOT EXISTS index_catalog_symbols_on_repository ON catalog_symbols(repository_id, id);

CREATE TABLE IF NOT EXISTS catalog_symbol_localizations (
  migration_run_id uuid NOT NULL REFERENCES catalog_migration_runs(id) ON DELETE CASCADE,
  symbol_id bigint NOT NULL REFERENCES catalog_symbols(id) ON DELETE CASCADE,
  locale text NOT NULL,
  name text,
  description text,
  search_string text,
  name_defaulted boolean,
  generated_name boolean,
  generated_description boolean,
  batch_translation integer,
  PRIMARY KEY (symbol_id, locale)
);
CREATE INDEX IF NOT EXISTS index_catalog_localizations_on_locale ON catalog_symbol_localizations(locale, symbol_id);

CREATE TABLE IF NOT EXISTS catalog_symbol_search_signals (
  migration_run_id uuid NOT NULL REFERENCES catalog_migration_runs(id) ON DELETE CASCADE,
  symbol_id bigint NOT NULL REFERENCES catalog_symbols(id) ON DELETE CASCADE,
  locale text NOT NULL,
  term text NOT NULL,
  signal_type text NOT NULL CHECK (signal_type IN ('boost', 'use_score')),
  score double precision NOT NULL,
  PRIMARY KEY (symbol_id, locale, term, signal_type)
);

CREATE TABLE IF NOT EXISTS catalog_symbol_variants (
  migration_run_id uuid NOT NULL REFERENCES catalog_migration_runs(id) ON DELETE CASCADE,
  symbol_id bigint NOT NULL REFERENCES catalog_symbols(id) ON DELETE CASCADE,
  variant_key text NOT NULL,
  object_path text NOT NULL,
  PRIMARY KEY (symbol_id, variant_key)
);

CREATE TABLE IF NOT EXISTS catalog_legacy_extensions (
  migration_run_id uuid NOT NULL REFERENCES catalog_migration_runs(id) ON DELETE CASCADE,
  source_table text NOT NULL,
  source_id bigint NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version = 1),
  payload jsonb NOT NULL,
  PRIMARY KEY (migration_run_id, source_table, source_id)
);

CREATE TABLE IF NOT EXISTS catalog_symbol_requests (
  id bigint PRIMARY KEY,
  migration_run_id uuid NOT NULL REFERENCES catalog_migration_runs(id) ON DELETE CASCADE,
  phrase text NOT NULL,
  locale text NOT NULL,
  vote_count integer NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS index_catalog_requests_on_locale_phrase ON catalog_symbol_requests(locale, phrase);

CREATE TABLE IF NOT EXISTS catalog_symbol_request_comments (
  migration_run_id uuid NOT NULL REFERENCES catalog_migration_runs(id) ON DELETE CASCADE,
  request_id bigint NOT NULL REFERENCES catalog_symbol_requests(id) ON DELETE CASCADE,
  ordinal integer NOT NULL,
  user_id text,
  comment_text text NOT NULL,
  commented_at timestamptz NOT NULL,
  PRIMARY KEY (request_id, ordinal)
);

CREATE TABLE IF NOT EXISTS catalog_api_clients (
  id bigint PRIMARY KEY,
  migration_run_id uuid NOT NULL REFERENCES catalog_migration_runs(id) ON DELETE CASCADE,
  shared_secret text NOT NULL UNIQUE,
  name text,
  email text,
  purpose text,
  organization text,
  organization_url text,
  website_url text,
  twitter text,
  approved boolean NOT NULL,
  full_access boolean NOT NULL,
  global_token boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
`

export const catalogTables = [
  'catalog_repositories',
  'catalog_repository_modifiers',
  'catalog_repository_defaults',
  'catalog_symbols',
  'catalog_symbol_localizations',
  'catalog_symbol_search_signals',
  'catalog_symbol_variants',
  'catalog_legacy_extensions',
  'catalog_symbol_requests',
  'catalog_symbol_request_comments',
  'catalog_api_clients',
  'catalog_migration_reconciliations',
] as const
