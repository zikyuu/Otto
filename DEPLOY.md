# Deploying Otto (free): Render + Supabase

Render runs the app (one Docker container: the backend serves the built page). Supabase stores everyone's data and handles
"Continue with Google". Render's free disk is wiped on every redeploy, which is why the data lives in Supabase.

## 1. Supabase (once)
1. supabase.com > New project (free). Wait for it to finish.
2. SQL editor: run `backend/migrations/001_otto_kv.sql`, then `002_otto_kv_rls.sql`.
3. Project settings > API: copy the **Project URL**, the **anon public** key and the **service_role** key (keep this one secret).

## 2. Google sign-in (once)
1. console.cloud.google.com > create a project > APIs & Services > OAuth consent screen (External; add yourself as a test user).
2. Credentials > Create credentials > OAuth client ID > Web application. Authorised redirect URI:
   `https://<your-project>.supabase.co/auth/v1/callback`. Copy the client ID and secret.
3. Supabase > Authentication > Providers > Google: switch on, paste the client ID and secret.
4. Supabase > Authentication > URL Configuration: Site URL = your Render address; add `http://localhost:5173` to Redirect URLs for local testing.

## 3. Render
1. render.com > New > Blueprint > pick this repo (it reads `render.yaml`).
2. Fill in the secrets it asks for: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `OTTO_ORIGIN` (the Render address, e.g. `https://otto.onrender.com`). `OPENAI_API_KEY` is optional.
3. Deploy. Open the address and sign in.

## Notes
- **Free tier sleeps** after 15 minutes without a visit; the next visit takes about a minute to wake.
- Anyone with a Google account can sign in while the consent screen is in "Testing" only if you list them as test users. Each person sees only their own data.
- The first person to sign in on a browser that already holds a local calendar adopts it into their account.
- Google Calendar sync (optional): set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI=https://<your app>/api/gcal/callback`, and add that URI to the OAuth client.
- **AI costs.** With login on, `OPENAI_API_KEY` (your key) only pays for **one free goal-review (wizard) call per account**, capped at 30 host-key calls a day across everyone (`OTTO_FREE_WIZARD_CALLS`, `OTTO_HOST_DAILY_CAP`). Everything else AI (weekly chat, tidying tasks, otter recap) needs the person's own OpenAI key, which they paste on the Rules page; it is checked with OpenAI and stored encrypted (set `OTTO_SECRET_KEY` to any long random string, or it falls back to a hash of the service-role key). Leave `OPENAI_API_KEY` unset and nobody gets a free call. Add a spend limit on your OpenAI account anyway.
- Run locally with login off as before (`uvicorn` + `npm run dev`); nothing needs configuring.
