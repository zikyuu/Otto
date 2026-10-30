import { useEffect, useMemo, useState } from 'react';
import Banner from '../components/Banner.jsx';
import { getLLMStatus, saveLLMKey, removeLLMKey, getMetrics, setTarget, setStatedRuleValue, clearStatedRule } from '../api.js';
import { valueFor, isError, fieldsFor } from './rulesForm.js';
import { IconClose } from './calendar/Icons.jsx';

// How Otto plans for you, with nothing hidden. Every setting has a short name, one line on what it means, its value, where that
// value came from, and what the scheduler does with it. You can set any of them yourself (it is then pinned and never changed
// by learning), and for some you can name a number to move towards.

function Panel({ title, sub, children, i = 1, right }) {
  return (
    <section className="bezel rise" style={{ '--i': i }}>
      <div className="core">
        <header style={{ padding: '16px 22px 4px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
            {sub && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.5 }}>{sub}</p>}
          </div>
          {right}
        </header>
        <div style={{ padding: '8px 22px 20px' }}>{children}</div>
      </div>
    </section>
  );
}

const field = { height: 36, padding: '0 12px', borderRadius: 12, border: 0, outline: 'none', fontSize: 13, fontWeight: 500, color: 'var(--ink)', background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line)', fontFamily: 'inherit', accentColor: 'var(--accent)' };

const SOURCE = {
  pinned: m => ['Set by you', '#E4EAD3', 'var(--accent-ink)', 'You set this. Learning never changes it.'],
  learned: m => [m.evidence ? `Learned from ${m.evidence} log${m.evidence === 1 ? '' : 's'}` : 'Learned', 'rgba(32,40,8,.07)', 'var(--ink-2)', m.evidence ? `Otto worked this out from ${m.evidence} of your logs and keeps adjusting it.` : 'Otto worked this out from how you work and keeps adjusting it.'],
  default: () => ['Starting guess', '#F3E6C8', '#8A6A2F', 'Otto has not seen enough of your days yet, so this is its starting guess.'],
  measured: () => ['Worked out', 'rgba(32,40,8,.07)', 'var(--ink-2)', 'Read from your other settings.'],
};

function ValueInput({ m, f, setF }) {
  const num = (k, w = 90, extra = {}) => <input aria-label={m.name} type="number" value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} style={{ ...field, width: w }} {...extra} />;
  if (m.kind === 'hours') return <><input aria-label="From hour" type="number" min={0} max={23} value={f.a} onChange={e => setF({ ...f, a: e.target.value })} style={{ ...field, width: 70 }} /><span style={{ fontSize: 13 }}>to</span><input aria-label="To hour" type="number" min={1} max={24} value={f.b} onChange={e => setF({ ...f, b: e.target.value })} style={{ ...field, width: 70 }} /></>;
  if (m.kind === 'clock') return <><input aria-label={m.name} type="time" value={f.text} onChange={e => setF({ ...f, text: e.target.value })} style={{ ...field, width: 120 }} />{m.key === 'day_end_min' && <label style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.past} onChange={e => setF({ ...f, past: e.target.checked })} />after midnight</label>}</>;
  if (m.kind === 'minutes') return <>{num('num')}<span style={{ fontSize: 13 }}>min</span></>;
  if (m.kind === 'percent') return <>{num('num')}<span style={{ fontSize: 13 }}>%</span></>;
  if (m.kind === 'choice') return <select aria-label={m.name} value={f.choice} onChange={e => setF({ ...f, choice: e.target.value })} style={field}>{(m.choices || []).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>;
  if (m.kind === 'bool') return <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.bool} onChange={e => setF({ ...f, bool: e.target.checked })} />Yes</label>;
  return null;
}

function Row({ m, onChanged }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(() => fieldsFor(m));
  const [tgt, setTgt] = useState(m.target != null ? String(m.target) : '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [label, bg, ink, why] = SOURCE[m.source](m);
  const run = async fn => { setBusy(true); setErr(''); try { await fn(); await onChanged(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const pin = () => { const v = valueFor(m, f); if (isError(v)) { setErr(v.error); return; } run(() => setStatedRuleValue(m.key, v)); };

  return (
    <div style={{ borderTop: '1px solid var(--line-soft)' }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '11px 0', background: 'none', border: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit', fontFamily: 'inherit' }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="display" style={{ display: 'block', fontSize: 14.5, fontWeight: 500 }}>{m.name}</span>
          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-3)', marginTop: 1 }}>{m.blurb}</span>
        </span>
        {m.target != null && m.can_target && <span className="mono" style={{ fontSize: 11, color: 'var(--accent-ink)' }} title="You are moving towards this">{'→ '}{m.target}{m.unit ? ` ${m.unit}` : ''}</span>}
        <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{m.display}</span>
        <span style={{ color: 'var(--ink-4)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s var(--ease)', fontSize: 11 }}>▾</span>
      </button>
      {open && (
        <div style={{ padding: '2px 0 14px', display: 'flex', flexDirection: 'column', gap: 12, animation: 'fadeIn .15s var(--ease)' }}>
          <div style={{ fontSize: 13, lineHeight: 1.55 }}>
            <span className="pill-tag" style={{ fontSize: 10, textTransform: 'none', letterSpacing: 0, background: bg, color: ink, marginRight: 8 }}>{label}</span>
            <span style={{ color: 'var(--ink-3)' }}>{why}</span>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.55 }}><strong style={{ fontWeight: 600 }}>How the scheduler uses it.</strong> {m.uses}</div>

          {m.editable && (
            <div>
              <p className="label-caps" style={{ margin: '0 0 6px' }}>{m.source === 'pinned' ? 'Your setting' : 'Set it yourself'}</p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <ValueInput m={m} f={f} setF={setF} />
                <button className="btn btn--primary" disabled={busy} onClick={pin} style={{ height: 34 }}>{m.source === 'pinned' ? 'Save' : 'Pin it'}</button>
                {m.source === 'pinned' && <button className="btn btn--ghost" disabled={busy} onClick={() => run(() => clearStatedRule(m.key))} style={{ height: 34 }}><IconClose size={11} />Let Otto work it out</button>}
              </div>
            </div>
          )}

          {m.can_target && (
            <div>
              <p className="label-caps" style={{ margin: '0 0 6px' }}>Try to move towards</p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input aria-label={`Target for ${m.name}`} type="number" min={0} value={tgt} placeholder={String(m.value)} onChange={e => setTgt(e.target.value)} style={{ ...field, width: 90 }} />
                <span style={{ fontSize: 13 }}>{m.unit}</span>
                <button className="btn" disabled={busy || tgt === ''} onClick={() => run(() => setTarget(m.key, Number(tgt)))} style={{ height: 34 }}>Set target</button>
                {m.target != null && <button className="btn btn--ghost" disabled={busy} onClick={() => { setTgt(''); run(() => setTarget(m.key, null)); }} style={{ height: 34 }}>Clear</button>}
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5 }}>
                {m.target != null ? `Now ${m.value}, aiming for ${m.target} ${m.unit}. ` : 'Optional. Otto keeps planning with what is true today, and cheers you on towards the number you pick. '}
                {m.key === 'post_meal_slump_min' ? 'Otto will give you a nudge at lunch.' : ''}
              </p>
            </div>
          )}
          {err && <p role="alert" style={{ margin: 0, fontSize: 12.5, color: '#A5543F' }}>{err}</p>}
        </div>
      )}
    </div>
  );
}

function AIKey() {
  const [st, setSt] = useState(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { getLLMStatus().then(setSt).catch(e => setError(e.message)); }, []);
  if (!st || !st.gated) return null;                           // running locally: the server's own key is used, nothing to set
  async function save() {
    setBusy(true); setError('');
    try { setSt(await saveLLMKey(key.trim())); setKey(''); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function remove() { setBusy(true); setError(''); try { setSt(await removeLLMKey()); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  return (
    <Panel i={1} title="AI features" sub="The weekly chat, the goal review wizard, tidying long tasks and the otter-voice recap use OpenAI. Everything else in Otto, including the scheduler, works without it.">
      <p style={{ margin: '4px 0 12px', fontSize: 13.5, lineHeight: 1.5 }}>
        {st.mode === 'own' ? <>Using <strong>your OpenAI key</strong> (ends in {st.own_hint}). The cost goes to your own OpenAI account.</>
          : st.free_left > 0 ? <>You have <strong>{st.free_left} free goal review</strong>. After that, add your own OpenAI key to keep using the AI features.</>
          : <>Your free goal review has been used. Add your own OpenAI key to keep using the AI features.</>}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="password" autoComplete="off" aria-label="OpenAI API key" placeholder={st.mode === 'own' ? 'Replace your key (sk-…)' : 'Paste your OpenAI key (sk-…)'} value={key} onChange={e => setKey(e.target.value)} style={{ ...field, flex: '1 1 260px', minWidth: 0 }} />
        <button className="btn btn--primary" disabled={busy || key.trim().length < 20} onClick={save}>{busy ? 'Checking…' : 'Save key'}</button>
        {st.mode === 'own' && <button className="btn btn--ghost" disabled={busy} onClick={remove}>Remove</button>}
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5 }}>Otto checks the key with OpenAI, then stores it encrypted on the server and uses it only for your own requests. It is never shown again. You can get one at platform.openai.com/api-keys.</p>
      {error && <p role="alert" style={{ margin: '10px 0 0', fontSize: 12.5, color: '#A5543F' }}>{error}</p>}
    </Panel>
  );
}


export default function Rules() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [all, setAll] = useState(false);
  const load = () => getMetrics().then(setData).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  const ms = data?.metrics || [];
  const pinned = ms.filter(m => m.source === 'pinned');
  const groups = useMemo(() => {
    const g = new Map();
    for (const m of ms.filter(m => m.source !== 'pinned')) { if (!g.has(m.group)) g.set(m.group, []); g.get(m.group).push(m); }
    return [...g.entries()];
  }, [ms]);
  const others = ms.length - pinned.length;

  return (
    <div style={{ padding: '14px 28px 48px 14px', maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Banner art="banner-stats" minHeight={120}>
        <p className="pill-tag" style={{ margin: 0 }}>How Otto sees you</p>
        <h1 style={{ margin: '12px 0 0', fontSize: 34, lineHeight: 1.05 }}>Rules</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14.5, color: 'var(--ink-2)' }}>Everything Otto has worked out about how you work, and what it does with it.</p>
      </Banner>

      <Panel i={1} title="Your rules" sub="Settings you have pinned. Otto plans around these and learning never changes them.">
        {!data && !error && <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Loading…</p>}
        {data && pinned.length === 0 && <p style={{ margin: '4px 0 6px', fontSize: 13.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>Nothing pinned. Otto works everything out itself. Open the list below to set any of it yourself.</p>}
        {pinned.map(m => <Row key={m.key} m={m} onChanged={load} />)}
        {error && <p role="alert" style={{ margin: '8px 0 0', fontSize: 12.5, color: '#A5543F' }}>{error}</p>}
      </Panel>

      <Panel i={2} title="What Otto has worked out" sub="Your rhythm, your focus, your pace. Open any one to see where it came from, how the scheduler uses it, and to set it yourself."
        right={<button className="btn" aria-expanded={all} onClick={() => setAll(a => !a)} style={{ height: 34 }}>{all ? 'Hide' : `Show ${others}`}<span style={{ marginLeft: 6, transform: all ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform .2s var(--ease)' }}>▾</span></button>}>
        {all && groups.map(([name, list]) => (
          <div key={name} style={{ marginTop: 6 }}>
            <p className="label-caps" style={{ margin: '14px 0 0' }}>{name}</p>
            {list.map(m => <Row key={m.key} m={m} onChanged={load} />)}
          </div>
        ))}
        {!all && <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>{others} settings Otto is working out by itself.</p>}
      </Panel>

      <AIKey />
    </div>
  );
}
