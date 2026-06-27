import { useMemo } from "react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR_START = 8;
const HOUR_END = 23;
const PX_PER_MIN = 0.6;

function minToY(min) {
  return (min - HOUR_START * 60) * PX_PER_MIN;
}

/**
 * The hero component: a week grid where walls (fixed commitments) and
 * scheduled task blocks render in real time slots. When `blocks` changes
 * (a re-solve), blocks transition to their new positions — the signature.
 */
export default function WeekGrid({ walls = [], blocks = [], tasks = [], deadlineDay = 4 }) {
  const taskById = useMemo(() => {
    const m = {};
    tasks.forEach((t) => (m[t.id] = t));
    return m;
  }, [tasks]);

  const gridHeight = (HOUR_END - HOUR_START) * 60 * PX_PER_MIN;

  return (
    <div style={st.wrap}>
      <div style={st.gutter}>
        {Array.from({ length: HOUR_END - HOUR_START + 1 }).map((_, i) => (
          <div key={i} className="mono" style={{ ...st.hourLabel, top: i * 60 * PX_PER_MIN }}>
            {String(HOUR_START + i).padStart(2, "0")}:00
          </div>
        ))}
      </div>

      <div style={st.cols}>
        {DAYS.map((d, day) => (
          <div key={d} style={st.col}>
            <div className="display" style={{ ...st.colHead, ...(day === deadlineDay ? st.deadlineHead : {}) }}>
              {d}
              {day === deadlineDay && <span style={st.deadlineTag}>deadline</span>}
            </div>
            <div style={{ ...st.colBody, height: gridHeight }}>
              {/* hour lines */}
              {Array.from({ length: HOUR_END - HOUR_START + 1 }).map((_, i) => (
                <div key={i} style={{ ...st.hourLine, top: i * 60 * PX_PER_MIN }} />
              ))}

              {/* walls — fixed commitments */}
              {walls.filter((w) => w.day === day).map((w, i) => (
                <div key={`w${i}`} style={{
                  ...st.wall,
                  top: minToY(w.start_min),
                  height: (w.end_min - w.start_min) * PX_PER_MIN,
                }}>
                  <span style={st.wallLabel}>{w.label}</span>
                </div>
              ))}

              {/* scheduled task blocks — the roadmap landing in free time */}
              {blocks.filter((b) => b.day === day).map((b) => {
                const t = taskById[b.task_id];
                return (
                  <div key={b.task_id} style={{
                    ...st.block,
                    top: minToY(b.start_min),
                    height: (b.end_min - b.start_min) * PX_PER_MIN,
                    ...(b.lite ? st.blockLite : {}),
                  }}>
                    <span style={st.blockTitle}>{t ? t.skill_served : b.task_id}</span>
                    {b.lite && <span style={st.liteTag}>lite</span>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const st = {
  wrap: { display: "flex", gap: 0, background: "var(--surface)", border: "0.5px solid var(--line)", borderRadius: 12, padding: 12, overflow: "auto" },
  gutter: { position: "relative", width: 48, flexShrink: 0, marginTop: 34 },
  hourLabel: { position: "absolute", fontSize: 10, color: "var(--muted)", transform: "translateY(-50%)" },
  cols: { display: "flex", flex: 1, gap: 6, minWidth: 560 },
  col: { flex: 1 },
  colHead: { fontSize: 13, fontWeight: 600, padding: "6px 0", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
  deadlineHead: { color: "var(--accent)" },
  deadlineTag: { fontSize: 9, color: "var(--accent)", textTransform: "uppercase", letterSpacing: ".05em" },
  colBody: { position: "relative", borderLeft: "0.5px solid var(--line)" },
  hourLine: { position: "absolute", left: 0, right: 0, height: 0, borderTop: "0.5px solid #EEF1F0" },
  wall: { position: "absolute", left: 2, right: 2, background: "repeating-linear-gradient(45deg, #EDEFEE, #EDEFEE 4px, #F4F6F5 4px, #F4F6F5 8px)", border: "0.5px solid var(--line)", borderRadius: 6, padding: 4, overflow: "hidden" },
  wallLabel: { fontSize: 10, color: "var(--muted)" },
  block: { position: "absolute", left: 2, right: 2, background: "var(--accent)", color: "#fff", borderRadius: 6, padding: "5px 7px", overflow: "hidden", transition: "top .5s cubic-bezier(.2,.8,.2,1), height .4s ease, background .3s ease", boxShadow: "0 1px 3px rgba(26,29,36,.12)" },
  blockLite: { background: "#7AA89E" },
  blockTitle: { fontSize: 11, fontWeight: 600, lineHeight: 1.2, display: "block" },
  liteTag: { fontSize: 9, opacity: .85 },
};
