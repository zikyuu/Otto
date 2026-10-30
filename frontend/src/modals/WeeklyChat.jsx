import { useEffect, useRef, useState } from 'react';
import Mascot from '../components/Mascot.jsx';
import { Overlay } from './Feasibility.jsx';
import { chatRules, applyChatRules, aiStatus, chatHistory } from '../api.js';
import { IconArrow, IconCheck, IconClose } from '../views/calendar/Icons.jsx';

// The weekly chat. The user says how they work in their own words; Otto turns that into rules, shows them, and only
// pins the ones the user ticks. Pinned rules override everything the app has learned (stated rules, level 1).
//   prompt   optional first line from Otto (e.g. the drift review: "your focus span has dropped")
const QUICK = [
  'I got a lot done but slept less',
  'Things took longer than I planned',
  'I was wiped out by the afternoon',
  'It went well, keep it as is',
];

// onReplan(): re-plans the flexible blocks with the new settings and returns { moved, undo }. Only ever called from a button.
export default function WeeklyChat({ prompt, onClose, onApplied, onReplan }) {
  const [msgs, setMsgs] = useState([{ who: 'otto', text: prompt || 'How is your week going? Tell me anything about how you work: when you focus best, what drains you, what you need after meetings.' }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState(null);     // { rules, picked: Set(key) }
  const [replan, setReplan] = useState(null);         // null | { busy } | { moved, undo }
  const [offerReplan, setOfferReplan] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);
  const [llm, setLlm] = useState(null);                 // is a language model connected? null = not known yet
  const [gated, setGated] = useState(false);
  useEffect(() => { aiStatus().then(r => { setLlm(r.llm); setGated(!!r.gated); }).catch(() => setLlm(null)); }, []);
  // open with what the last check-in settled, so it carries on from there (a summary, not the old conversation)
  useEffect(() => {
    if (prompt) return;
    chatHistory().then(h => { if (h.opener) setMsgs(m => (m.length === 1 && m[0].who === 'otto' ? [{ who: 'otto', text: h.opener }] : m)); }).catch(() => {});
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs, proposal]);

  async function send(raw) {
    const t = (raw ?? text).trim();
    if (!t || busy) return;
    setText(''); setError(''); setBusy(true);
    setMsgs(m => [...m, { who: 'you', text: t }]);
    try {
      const r = await chatRules(t);
      setMsgs(m => [...m, { who: 'otto', text: r.reply }, ...(r.follow_up ? [{ who: 'otto', text: r.follow_up }] : [])]);
      setProposal(r.rules.length ? { rules: r.rules, picked: new Set(r.rules.map(x => x.key)) } : null);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function pin() {
    const chosen = proposal.rules.filter(r => proposal.picked.has(r.key)).map(({ key, value, note, label, source, reason }) => ({ key, value, note, label, source, reason }));
    if (!chosen.length) return;
    setBusy(true); setError('');
    try {
      const r = await applyChatRules(chosen);
      const bad = r.rejected.length ? ` ${r.rejected.length} could not be saved.` : '';
      setMsgs(m => [...m, { who: 'otto', text: `Done. I will plan around ${r.applied.length === 1 ? 'that change' : 'those changes'} from now on.${bad}` }]);
      setProposal(null);
      setOfferReplan(!!r.replan && !!onReplan);
      onApplied?.(r);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const toggle = key => setProposal(p => { const s = new Set(p.picked); s.has(key) ? s.delete(key) : s.add(key); return { ...p, picked: s }; });

  return (
    <Overlay>
      <div className="bezel bezel--float" style={{ width: 'min(560px,94%)', height: 'min(640px,92%)', display: 'flex', animation: 'sheetUp .7s var(--ease) both' }}>
        <div className="core" style={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: 0 }}>
          <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px 12px', borderBottom: '1px solid var(--line)' }}>
            <Mascot art="otter-reading" size={52} zoom={2.5} />
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-.025em' }}>Weekly check-in</h2>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-3)' }}>What you tell me here beats anything I have guessed.</p>
            </div>
            <button className="btn btn--icon" onClick={onClose} aria-label="Close"><IconClose size={13} /></button>
          </header>

          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {msgs.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.who === 'you' ? 'flex-end' : 'flex-start', maxWidth: '84%', padding: '10px 14px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.5,
                background: m.who === 'you' ? 'var(--forest)' : 'var(--surface-2)', color: m.who === 'you' ? 'var(--forest-ink)' : 'var(--ink)',
                boxShadow: m.who === 'you' ? 'none' : 'inset 0 0 0 1px var(--line)', animation: 'popIn .4s var(--spring) both',
              }}>{m.text}</div>
            ))}
            {busy && !proposal && (
              <div aria-live="polite" style={{ alignSelf: 'flex-start', padding: '10px 14px', borderRadius: 12, fontSize: 13.5, color: 'var(--ink-3)', background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
                Otto is thinking<span style={{ animation: 'ringPulse 1.1s var(--ease) infinite' }}>…</span>
              </div>
            )}
            {proposal && (
              <div role="group" aria-label="Rules I understood" style={{ padding: 14, borderRadius: 12, background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--line)', animation: 'popIn .5s var(--spring) both' }}>
                <p className="label-caps" style={{ margin: '0 0 4px' }}>What I would change</p>
                <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--ink-3)' }}>Tick the ones you agree with. Nothing changes until you press Apply.</p>
                {proposal.rules.map(r => (
                  <label key={r.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', fontSize: 13.5, cursor: 'pointer', borderTop: '1px solid var(--line-soft)' }}>
                    <input type="checkbox" checked={proposal.picked.has(r.key)} onChange={() => toggle(r.key)} style={{ marginTop: 3 }} />
                    <span style={{ flex: 1 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <strong className="display" style={{ fontWeight: 600 }}>{r.label}</strong>
                        <span className="pill-tag" style={{ fontSize: 10, textTransform: 'none', letterSpacing: 0, background: r.source === 'inferred' ? '#F3E6C8' : 'rgba(106,120,77,.14)', color: r.source === 'inferred' ? '#8A6A2F' : 'var(--accent-ink)' }}>{r.source === 'inferred' ? 'Otto\u2019s suggestion' : 'you said'}</span>
                      </span>
                      {r.current_label && r.current_label !== r.label && <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)' }}>Now: {r.current_label}</span>}
                      {r.reason && <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.45, marginTop: 2 }}>{r.reason}</span>}
                    </span>
                  </label>
                ))}
                <button className="btn btn--primary" disabled={busy || proposal.picked.size === 0} onClick={pin} style={{ marginTop: 10, height: 38, padding: '0 8px 0 18px' }}>
                  Apply {proposal.picked.size}<span className="btn__icon" style={{ width: 24, height: 24, marginRight: 0 }}><IconCheck size={12} /></span>
                </button>
              </div>
            )}
            {msgs.length === 1 && !busy && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {QUICK.map(q => <button key={q} className="btn" style={{ height: 30, fontSize: 12.5 }} onClick={() => send(q)}>{q}</button>)}
              </div>
            )}
            {offerReplan && (
              <div role="group" aria-label="Re-plan" style={{ padding: 14, borderRadius: 18, background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--line)', animation: 'popIn .5s var(--spring) both' }}>
                {!replan?.moved && replan?.moved !== 0 ? (
                  <>
                    <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>Want your calendar to follow? Otto can re-plan the flexible blocks of the next two weeks around the new settings. Locked events never move, and you can undo it.</p>
                    <button className="btn btn--primary" disabled={replan?.busy} style={{ marginTop: 10 }} onClick={async () => { setReplan({ busy: true }); try { setReplan(await onReplan()); } catch (e) { setReplan(null); setError(e.message); } }}>
                      {replan?.busy ? 'Re-planning…' : 'Re-plan my two weeks'}
                    </button>
                  </>
                ) : (
                  <>
                    <p style={{ margin: 0, fontSize: 13.5 }}>{replan.moved === 0 ? 'Nothing needed to move.' : `${replan.moved} block${replan.moved === 1 ? '' : 's'} moved.`}</p>
                    {replan.moved > 0 && <button className="btn" style={{ marginTop: 8 }} onClick={() => { replan.undo(); setReplan(null); setOfferReplan(false); }}>Undo</button>}
                  </>
                )}
              </div>
            )}
            {error && <p role="alert" style={{ margin: 0, fontSize: 12.5, color: '#A5543F' }}>{error}</p>}
            <div ref={endRef} />
          </div>

          {llm !== null && (
            <p style={{ margin: 0, padding: '6px 20px 0', fontSize: 11.5, color: 'var(--ink-3)' }}>
              {llm ? 'Otto replies using an AI language model. Only rules you tick are pinned.' : gated ? 'Open conversation needs your own OpenAI key: add it on the Rules page. Until then Otto understands simple sentences like "I focus best from 9 to 12".' : 'No AI key is set on the server, so Otto only understands simple sentences like "I focus best from 9 to 12". Add OPENAI_API_KEY to backend/.env for open conversation.'}
            </p>
          )}
          <form onSubmit={e => { e.preventDefault(); send(); }} style={{ display: 'flex', gap: 8, padding: '12px 16px 16px', borderTop: '1px solid var(--line)' }}>
            <input value={text} onChange={e => setText(e.target.value)} placeholder="I focus best between 9 and 12…" aria-label="Tell Otto how you work" autoFocus
              style={{ flex: 1, height: 42, padding: '0 16px', borderRadius: 6, border: 0, fontFamily: 'inherit', fontSize: 14, background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line)', outline: 'none', color: 'var(--ink)' }} />
            <button className="btn btn--primary" type="submit" disabled={busy || !text.trim()} style={{ height: 42, padding: '0 8px 0 18px' }}>
              {busy ? '…' : 'Send'}<span className="btn__icon" style={{ width: 26, height: 26, marginRight: 0 }}><IconArrow size={13} /></span>
            </button>
          </form>
        </div>
      </div>
    </Overlay>
  );
}
