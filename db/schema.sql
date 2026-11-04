-- Schrijfsite databaseschema (Neon / PostgreSQL 15+)
-- Idempotent: kan veilig opnieuw uitgevoerd worden.

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  name          text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS handwritings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  settings   jsonb NOT NULL DEFAULT '{}'::jsonb,
  analysis   jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS handwritings_user_idx ON handwritings(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS glyphs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handwriting_id uuid NOT NULL REFERENCES handwritings(id) ON DELETE CASCADE,
  ch             text NOT NULL,
  png            text NOT NULL,
  width          integer NOT NULL,
  height         integer NOT NULL,
  baseline       real NOT NULL,
  source         text NOT NULL DEFAULT 'scan',
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS glyphs_hw_idx ON glyphs(handwriting_id, ch);

CREATE TABLE IF NOT EXISTS documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  handwriting_id uuid REFERENCES handwritings(id) ON DELETE SET NULL,
  title          text NOT NULL,
  content        text NOT NULL,
  options        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_user_idx ON documents(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_usage (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day     date NOT NULL,
  count   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS login_attempts (
  key text NOT NULL,
  at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_idx ON login_attempts(key, at);
