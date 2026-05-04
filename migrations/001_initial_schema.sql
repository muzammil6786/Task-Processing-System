-- migrations/001_initial_schema.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Initial schema for the Task Processing System.
-- Run via: psql -U <user> -d <db> -f migrations/001_initial_schema.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(100) NOT NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- ─── refresh_tokens ───────────────────────────────────────────────────────────
-- Stored hashed refresh tokens for rotation / revocation.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash    ON refresh_tokens (token_hash);

-- ─── tasks ───────────────────────────────────────────────────────────────────
-- ENUM for task status keeps values self-documenting and constraint-enforced.
CREATE TYPE task_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- ENUM for task type (extensible — add new types via ALTER TYPE).
CREATE TYPE task_type AS ENUM ('data_processing', 'report_generation', 'email_sending', 'file_conversion');

CREATE TABLE IF NOT EXISTS tasks (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type          task_type   NOT NULL,
  status        task_status NOT NULL DEFAULT 'pending',
  priority      SMALLINT    NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 10),
  payload       JSONB       NOT NULL DEFAULT '{}',
  result        JSONB,
  error_message TEXT,
  queue_job_id  VARCHAR(255),               -- BullMQ job id for cross-referencing
  attempts      SMALLINT    NOT NULL DEFAULT 0,
  max_attempts  SMALLINT    NOT NULL DEFAULT 3,
  scheduled_at  TIMESTAMPTZ,               -- optional delayed processing
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Frequent query patterns
CREATE INDEX IF NOT EXISTS idx_tasks_user_id   ON tasks (user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status    ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks (created_at DESC);
-- Composite for the "my pending tasks" query
CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks (user_id, status);

-- ─── task_logs ────────────────────────────────────────────────────────────────
-- Immutable audit trail of every status transition.
CREATE TABLE IF NOT EXISTS task_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID        NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  from_status task_status,
  to_status   task_status NOT NULL,
  message     TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_logs_task_id ON task_logs (task_id);

-- ─── updated_at trigger ──────────────────────────────────────────────────────
-- Automatically update the updated_at column on row modification.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_users_updated_at') THEN
    CREATE TRIGGER set_users_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_tasks_updated_at') THEN
    CREATE TRIGGER set_tasks_updated_at
      BEFORE UPDATE ON tasks
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;
