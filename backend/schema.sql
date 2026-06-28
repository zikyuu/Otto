-- Otto — Supabase schema
-- Run this in the Supabase SQL editor (dashboard → SQL Editor → New query).
-- SQLAlchemy's init_db() will also create these on first startup via CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS profiles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  TEXT,
    free_hours_per_day FLOAT NOT NULL DEFAULT 3.0,
    velocity    FLOAT NOT NULL DEFAULT 0.8,
    name        TEXT DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS profiles_session_id_idx ON profiles (session_id);

CREATE TABLE IF NOT EXISTS skills (
    id          TEXT PRIMARY KEY,
    profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    proficiency INT  NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS walls (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    day         INT  NOT NULL,
    start_min   INT  NOT NULL,
    end_min     INT  NOT NULL,
    label       TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS goals (
    id          TEXT PRIMARY KEY,
    profile_id  UUID REFERENCES profiles(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    jd_text     TEXT DEFAULT '',
    close_date  TEXT DEFAULT '',
    fit         FLOAT DEFAULT 0.5,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS goal_required_skills (
    goal_id     TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    skill_name  TEXT NOT NULL,
    PRIMARY KEY (goal_id, skill_name)
);

CREATE TABLE IF NOT EXISTS tasks (
    id           TEXT PRIMARY KEY,
    goal_id      TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    skill_served TEXT NOT NULL,
    importance   FLOAT NOT NULL,
    full_minutes INT  NOT NULL,
    lite_minutes INT  NOT NULL,
    status       TEXT NOT NULL DEFAULT 'todo',
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_prereqs (
    task_id   TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    prereq_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, prereq_id)
);

CREATE TABLE IF NOT EXISTS plans (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    feasible   BOOLEAN NOT NULL DEFAULT TRUE,
    at_risk    JSONB DEFAULT '[]',
    tradeoff   JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blocks (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id   UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    task_id   TEXT NOT NULL,
    day       INT  NOT NULL,
    start_min INT  NOT NULL,
    end_min   INT  NOT NULL,
    lite      BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS completion_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id         TEXT NOT NULL,
    planned_minutes INT  NOT NULL,
    done            BOOLEAN NOT NULL,
    ts              TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS completion_events_task_id_idx ON completion_events (task_id);
