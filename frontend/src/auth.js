// Sign-in with Google through Supabase Auth. The server says whether login is required (and gives the public Supabase
// address and anon key); with it off, none of this runs and the app behaves exactly as it does locally.
import { isApiCall, clearOttoKeys, OWNER_KEY } from './authLogic.js';

let config = { required: false };
let sb = null;
let token = null;
let user = null;
let patched = false;

export const authRequired = () => config.required;
export const currentUser = () => user;
export const tokenNow = () => token;          // for places that cannot wait (the page closing)

export async function loadAuthConfig() {
  try {
    const r = await fetch('/api/auth/config');
    config = r.ok ? await r.json() : { required: false };
  } catch { config = { required: false }; }
  return config;
}

async function client() {
  if (sb) return sb;
  const { createClient } = await import('@supabase/supabase-js');
  sb = createClient(config.supabase_url, config.anon_key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return sb;
}

function remember(session) {
  token = session?.access_token ?? null;
  user = session?.user ? { id: session.user.id, email: session.user.email || '', name: session.user.user_metadata?.full_name || '' } : null;
}

// every call to our own API carries the person's token; a refused token (expired, revoked) sends them back to sign in
function patchFetch() {
  if (patched) return;
  patched = true;
  const raw = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (!isApiCall(url) || !config.required) return raw(input, init);
    const { data } = await (await client()).auth.getSession();
    remember(data.session);
    const headers = new Headers(init.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const res = await raw(input, { ...init, headers });
    if (res.status === 401 && token) (await client()).auth.signOut();
    return res;
  };
}

// calls back with the session whenever it changes; returns the first one
export async function startAuth(onChange) {
  patchFetch();
  const c = await client();
  const { data } = await c.auth.getSession();
  remember(data.session);
  c.auth.onAuthStateChange((_event, session) => { remember(session); onChange(session); });
  return data.session;
}

export async function signInWithGoogle() {
  const { error } = await (await client()).auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
  if (error) throw error;
}

export async function signOut() {
  try { clearOttoKeys(localStorage); localStorage.removeItem(OWNER_KEY); } catch { /* storage unavailable */ }
  await (await client()).auth.signOut();
}
