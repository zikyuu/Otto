import { useState, useEffect } from "react";
import WeekGrid from "./components/WeekGrid.jsx";
import "./styles.css";

const API = import.meta.env.VITE_API ?? "http://127.0.0.1:8770";
const DEADLINE_DAY = 4; // Friday

export default function App() {
  const [demo, setDemo] = useState(null);
  const [resume, setResume] = useState("");
  const [jd, setJd] = useState("");
  const [walls, setWalls] = useState([]);
  const [freeHours, setFreeHours] = useState(3);

  const [profile, setProfile] = useState(null);
  const [resumeReady, setResumeReady] = useState(false); // true once file parsed
  const [goals, setGoals] = useState([]);
  const [plan, setPlan] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [narration, setNarration] = useState("");
  const [screen, setScreen] = useState("setup"); // setup | plan
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/demo`).then((r) => r.json()).then((d) => {
      setDemo(d);
      setResume(d.resume_text);
      setJd(d.demo_jd);
      setWalls(d.walls);
    }).catch(() => {});
  }, []);

  async function handleResumeFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const p = await fetch(`${API}/api/parse-resume-file`, {
        method: "POST", body: form,
      }).then((r) => r.json());
      p.walls = walls;
      p.free_hours_per_day = freeHours;
      setProfile(p);
      setResumeReady(true);
    } finally {
      setLoading(false);
    }
  }

  async function buildPlan() {
    setLoading(true);
    try {
      if (!resumeReady || !profile) return;
      const p = { ...profile, walls, free_hours_per_day: freeHours };
      setProfile(p);

      const g = await fetch(`${API}/api/goal`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jd_text: jd, goal_id: "job1" }),
      }).then((r) => r.json());
      setGoals([g]);

      const res = await fetch(`${API}/api/plan`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: p, goals: [g], deadline_day: DEADLINE_DAY }),
      }).then((r) => r.json());
      setPlan(res.plan);
      setTasks(res.tasks);
      setScreen("plan");
    } finally {
      setLoading(false);
    }
  }

  async function markMissed(taskId) {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/reshuffle`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile, goals, deadline_day: DEADLINE_DAY, missed_task_ids: [taskId],
        }),
      }).then((r) => r.json());
      setPlan(res.plan);
      setTasks(res.tasks);
      setNarration(res.narration);
    } finally {
      setLoading(false);
    }
  }

  const onTrack = plan && plan.feasible && !plan.tradeoff;

  return (
    <div style={ui.page}>
      <header style={ui.header}>
        <span className="display" style={ui.logo}>Otto</span>
        <span style={ui.tagline}>the job becomes your plan</span>
      </header>

      {screen === "setup" && (
        <div style={ui.setup}>
          <Field label="Your résumé">
            <div style={ui.uploadRow}>
              <label style={{...ui.uploadBtn, ...(resumeReady ? ui.uploadBtnDone : {})}}>
                {loading ? "Parsing…" : resumeReady ? "✓ Resume parsed" : "Upload PDF"}
                <input type="file" accept=".pdf,.txt" onChange={handleResumeFile}
                  style={{ display: "none" }} />
              </label>
              {resumeReady && (
                <button style={ui.clearBtn} onClick={() => { setResumeReady(false); setProfile(null); }}>
                  ✕ clear
                </button>
              )}
            </div>
          </Field>
          <Field label="A job you want">
            <textarea className="mono" style={ui.area} value={jd}
              onChange={(e) => setJd(e.target.value)} rows={4}
              placeholder="Paste a job description…" />
          </Field>
          <Field label={`Free hours per day · ${freeHours}h`}>
            <input type="range" min={1} max={8} step={0.5} value={freeHours}
              onChange={(e) => setFreeHours(parseFloat(e.target.value))}
              style={{ width: "100%" }} />
          </Field>
          <div style={ui.wallsRow}>
            <span style={ui.wallsLabel}>Your week: {walls.length} fixed blocks loaded</span>
          </div>
          <button className="primary" onClick={buildPlan} disabled={loading || !resumeReady}
            style={{ marginTop: 8 }}>
            {loading ? "Building…" : "Build my plan →"}
          </button>
        </div>
      )}

      {screen === "plan" && plan && (
        <div style={ui.planView}>
          <div style={ui.statusRow}>
            <div>
              <div className="display" style={ui.goalTitle}>
                {goals[0]?.title || "Your role"}
              </div>
              <div style={ui.gapline}>
                Roadmap: {tasks.map((t) => t.skill_served).join(" · ") || "no gaps"}
              </div>
            </div>
            <span style={{ ...ui.statusPill,
              background: onTrack ? "var(--accent-soft)" : "var(--warn-soft)",
              color: onTrack ? "var(--accent)" : "var(--warn)" }}>
              ● {onTrack ? "On track" : plan.tradeoff ? "Choose one" : "At risk"}
            </span>
          </div>

          <WeekGrid walls={walls} blocks={plan.blocks} tasks={tasks}
            deadlineDay={DEADLINE_DAY} />

          {plan.tradeoff && (
            <div style={ui.tradeoff}>
              <div style={ui.tradeoffReason}>{plan.tradeoff.reason}</div>
              <div style={ui.tradeoffOpts}>
                {plan.tradeoff.options.map((o) => (
                  <button key={o.goal_id} style={ui.tradeoffBtn}>{o.label}</button>
                ))}
              </div>
            </div>
          )}

          {narration && <div style={ui.narration}>◇ {narration}</div>}

          <div style={ui.taskList}>
            <div style={ui.taskListHead}>This week's tasks — tap one you didn't finish</div>
            {tasks.map((t) => (
              <button key={t.id} onClick={() => markMissed(t.id)} style={ui.taskRow}>
                <span>{t.title}</span>
                <span style={ui.taskMeta} className="mono">{t.est_minutes}m</span>
              </button>
            ))}
          </div>

          <button onClick={() => setScreen("setup")} style={{ marginTop: 4 }}>← Edit inputs</button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={ui.fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

const ui = {
  page: { maxWidth: 760, margin: "0 auto", padding: "28px 18px 60px" },
  header: { display: "flex", alignItems: "baseline", gap: 10, marginBottom: 22 },
  logo: { fontSize: 22, fontWeight: 700, letterSpacing: "-.01em" },
  tagline: { fontSize: 13, color: "var(--muted)" },
  setup: { background: "var(--surface)", border: "0.5px solid var(--line)", borderRadius: 12, padding: 18 },
  fieldLabel: { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 },
  area: { width: "100%", border: "0.5px solid var(--line)", borderRadius: 8, padding: 10, fontSize: 12, resize: "vertical", lineHeight: 1.5 },
  uploadRow: { display: "flex", alignItems: "center", gap: 8 },
  uploadBtn: { display: "inline-block", cursor: "pointer", background: "var(--surface)", border: "0.5px solid var(--line)", borderRadius: 8, padding: "9px 14px", fontSize: 14, color: "var(--ink)", transition: "background .15s ease" },
  uploadBtnDone: { background: "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--accent)", fontWeight: 600 },
  clearBtn: { fontSize: 12, padding: "4px 8px", color: "var(--muted)", borderColor: "var(--line)" },
  wallsRow: { marginBottom: 6 },
  wallsLabel: { fontSize: 12, color: "var(--muted)" },
  planView: {},
  statusRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  goalTitle: { fontSize: 18, fontWeight: 600 },
  gapline: { fontSize: 12, color: "var(--muted)", marginTop: 3 },
  statusPill: { fontSize: 12, fontWeight: 600, padding: "5px 11px", borderRadius: 20, whiteSpace: "nowrap" },
  tradeoff: { marginTop: 12, background: "var(--warn-soft)", border: "0.5px solid var(--warn)", borderRadius: 10, padding: 14 },
  tradeoffReason: { fontSize: 13, color: "var(--warn)", lineHeight: 1.5, marginBottom: 10 },
  tradeoffOpts: { display: "flex", gap: 8, flexWrap: "wrap" },
  tradeoffBtn: { borderColor: "var(--warn)", color: "var(--warn)" },
  narration: { marginTop: 12, fontSize: 13, color: "var(--ink)", background: "var(--accent-soft)", borderRadius: 10, padding: "10px 12px", lineHeight: 1.5 },
  taskList: { marginTop: 16 },
  taskListHead: { fontSize: 12, color: "var(--muted)", marginBottom: 8 },
  taskRow: { width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, textAlign: "left" },
  taskMeta: { fontSize: 11, color: "var(--muted)" },
};
