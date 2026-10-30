-- Otto: lock the table down. The server reaches it with the service-role key (which bypasses row-level security);
-- the public "anon" key, which ships in the web page, must not be able to read or write anyone's documents.
ALTER TABLE otto_kv ENABLE ROW LEVEL SECURITY;
-- no policies on purpose: with RLS on and no policy, the anon and authenticated roles can do nothing here.
