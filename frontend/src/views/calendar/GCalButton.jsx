import { useEffect, useState } from 'react';
import { gcalStatus, gcalAuthUrl, gcalEvents, gcalDisconnect } from '../../api.js';
import { isoDate } from './calendarUtils.js';
import { syncGcalInto } from './gcalSync.js';

// Google Calendar, read-only (the merge rule is in gcalSync.js). Needs GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET on the backend: until then the button says so
// instead of failing. Imported events are fixed (Otto plans around them) and tagged source:'gcal', so a sync replaces
// exactly those and never anything the user made.
export default function GCalButton({ days, setEvents, onNote }) {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => gcalStatus().then(setSt).catch(() => setSt(null));
  useEffect(() => {
    refresh();
    const q = new URLSearchParams(window.location.search).get('gcal');       // coming back from Google's consent screen
    if (q) {
      onNote?.(q === 'connected' ? 'Google Calendar is connected.' : 'Google Calendar was not connected.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  async function sync() {
    setBusy(true);
    try {
      const startIso = isoDate(days[0]), endIso = isoDate(days[days.length - 1]);
      const r = await gcalEvents(startIso, endIso);
      setEvents(prev => syncGcalInto(prev, r.events, { startIso, endIso }));
      onNote?.(`Imported ${r.events.length} event${r.events.length === 1 ? '' : 's'} from Google Calendar.`);
    } catch (e) { onNote?.(e.message); } finally { setBusy(false); }
  }
  async function connect() {
    try { window.location.href = (await gcalAuthUrl()).url; } catch (e) { onNote?.(e.message); }
  }
  async function disconnect() {
    await gcalDisconnect().catch(() => {});
    setEvents(prev => prev.filter(e => e.source !== 'gcal'));
    refresh();
    onNote?.('Google Calendar is disconnected and its events are removed.');
  }

  if (!st) return null;
  if (!st.configured) {
    return <button className="btn" disabled title={st.hint || 'Google Calendar is not configured'}>Google Calendar: not set up</button>;
  }
  return st.connected ? (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      <button className="btn" onClick={sync} disabled={busy}>{busy ? 'Syncing…' : 'Sync Google Calendar'}</button>
      <button className="btn btn--ghost" onClick={disconnect}>Disconnect</button>
    </span>
  ) : <button className="btn" onClick={connect}>Connect Google Calendar</button>;
}
