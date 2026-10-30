// Who owns the data sitting in this browser. Everything under otto.* in localStorage belongs to whoever was signed in when it was
// written. If somebody else signs in, it is cleared before anything is loaded or uploaded, so one person's calendar can never
// be sent up under another person's account. The first sign-in on a browser that has never had an owner adopts what is there
// (that is how an existing local calendar moves into the new account).

export const OWNER_KEY = 'ottoAuth.owner';          // deliberately not under otto.: it is never mirrored to the server

export function ownerAction(storedOwner, uid) {
  if (!storedOwner) return 'adopt';
  return storedOwner === uid ? 'keep' : 'clear';
}

export function clearOttoKeys(storage) {
  const gone = [];
  for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.startsWith('otto.')) gone.push(k); }
  gone.forEach(k => storage.removeItem(k));
  return gone.length;
}

// returns what was done, for the caller to log or test
export function prepareLocalData(storage, uid) {
  const act = ownerAction(storage.getItem(OWNER_KEY), uid);
  if (act === 'clear') clearOttoKeys(storage);
  if (act !== 'keep') storage.setItem(OWNER_KEY, uid);
  return act;
}

// only same-origin API calls carry the token, never anything else the page fetches
export const isApiCall = url => typeof url === 'string' && /^\/api\//.test(url);
