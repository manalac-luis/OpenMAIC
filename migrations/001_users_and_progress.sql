-- Migration 001: Users, auth, and progress tracking
-- Added by Gigabox Research (2026) for multi-user support

CREATE TABLE IF NOT EXISTS users (
    id              BIGSERIAL PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    name            VARCHAR(255),
    role            VARCHAR(20) NOT NULL DEFAULT 'user',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
    id              BIGSERIAL PRIMARY KEY,
    key_prefix      VARCHAR(16) NOT NULL,
    key_hash        VARCHAR(64) NOT NULL UNIQUE,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(255),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at    TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

CREATE TABLE IF NOT EXISTS magic_links (
    token           VARCHAR(128) PRIMARY KEY,
    email           VARCHAR(255) NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    used_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_magic_links_email ON magic_links(email);

CREATE TABLE IF NOT EXISTS classroom_progress (
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    classroom_id    VARCHAR(100) NOT NULL,
    current_scene   INT NOT NULL DEFAULT 0,
    completed       BOOLEAN NOT NULL DEFAULT false,
    last_accessed   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, classroom_id)
);

CREATE TABLE IF NOT EXISTS scene_completions (
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    classroom_id    VARCHAR(100) NOT NULL,
    scene_index     INT NOT NULL,
    completed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, classroom_id, scene_index)
);

-- Track applied migrations
CREATE TABLE IF NOT EXISTS _migrations (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL UNIQUE,
    applied_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
