-- Otto: app state (calendar events, goals, grinder, chat history, ...) as one JSON document per key.
-- Run once in the Supabase SQL editor. It adds one table and touches none of the existing ones.
CREATE TABLE IF NOT EXISTS otto_kv (
    key        TEXT PRIMARY KEY,
    value      JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
