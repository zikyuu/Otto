import panickedImg from '../assets/mascots/panicked.png';

export default function Recovery({ onExit, narration, tasks = [], checks = {} }) {
  const remaining = tasks.filter(t => !checks[t.id] && t.status !== 'done');
  const bestMove = remaining.find(t => t.importance >= 0.7) || remaining[0];
  const nextTasks = remaining.filter(t => t !== bestMove).slice(0, 2);

  const fmtMins = m => m >= 60 ? `${Math.round(m / 60 * 10) / 10}h` : `${m} min`;

  return (
    <div style={{ animation: 'fadeIn .45s ease' }}>
      <div style={{
        background: 'linear-gradient(150deg,#F3EBDC,#FBF1EC)',
        padding: '38px 44px 30px',
        display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
      }}>
        <img
          src={panickedImg} alt="panicked otter"
          style={{ width: 138, height: 'auto', flex: '0 0 auto', animation: 'floatM 4s ease-in-out infinite', filter: 'drop-shadow(0 10px 14px rgba(110,84,54,.22))' }}
        />
        <div style={{ minWidth: 280, flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: '1.5px', color: '#D8923A', textTransform: 'uppercase' }}>
            A gentle reset
          </div>
          <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 30, color: '#4A3526', lineHeight: 1.08, margin: '7px 0 8px' }}>
            Rough week — that's completely normal.
          </div>
          <div style={{ fontSize: 16, color: '#8C7A64', lineHeight: 1.5 }}>
            Nothing is "overdue." Let's find the best path from where you are right now.
          </div>
        </div>
      </div>

      <div style={{ padding: '24px 44px 40px' }}>

        {/* Loading state while reshuffle processes */}
        {tasks.length === 0 && !narration && (
          <div style={{ textAlign: 'center', color: '#AD9B84', fontSize: 15, padding: '32px 0' }}>
            Reshuffling your week…
          </div>
        )}

        {/* Best move */}
        {bestMove && (
          <div style={{
            background: '#fff', borderRadius: 22, padding: '22px 24px',
            boxShadow: '0 18px 40px -24px rgba(150,108,64,.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 18, flexWrap: 'wrap',
          }}>
            <div style={{ minWidth: 240 }}>
              <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: '1.5px', color: '#A8703E' }}>START HERE — JUST THIS</div>
              <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 23, color: '#4A3526', margin: '7px 0 4px' }}>
                {bestMove.title?.replace(/^Build skill:\s*/i, '') ?? bestMove.t}
              </div>
              <div style={{ color: '#8C7A64', fontWeight: 600, fontSize: 14 }}>
                One clean win · {fmtMins(bestMove.full_minutes ?? 45)}
                {bestMove.skill_served ? ` · ${bestMove.skill_served}` : ''}
              </div>
            </div>
            <div style={{
              background: 'linear-gradient(135deg,#C0894F,#A8703E)', color: '#fff',
              fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 15,
              padding: '14px 24px', borderRadius: 15, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>Start</div>
          </div>
        )}

        {/* Next tasks */}
        {nextTasks.length > 0 && (
          <div style={{
            marginTop: 16, background: '#E2F2EA', border: '1px solid #C9E6D5',
            borderRadius: 20, padding: '20px 22px',
          }}>
            <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: '1px', color: '#4FA77D', marginBottom: 12 }}>UP NEXT</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {nextTasks.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 16, color: '#4A3526' }}>
                      {t.title?.replace(/^Build skill:\s*/i, '') ?? t.t}
                    </div>
                    <div style={{ fontSize: 13, color: '#5C7A6A', marginTop: 2 }}>
                      {fmtMins(t.full_minutes ?? 30)}{t.skill_served ? ` · ${t.skill_served}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LLM narration */}
        {narration && (
          <div style={{
            marginTop: 16, background: '#fff', border: '1px solid #ECE3D4',
            borderRadius: 16, padding: '16px 18px',
            fontSize: 14, color: '#5C4A35', lineHeight: 1.6,
          }}>
            {narration}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <span onClick={onExit} style={{ cursor: 'pointer', fontWeight: 700, fontSize: 14, color: '#8C7A64', borderBottom: '2px solid #E1D5C0', paddingBottom: 2 }}>
            I'm okay now — back to my plan
          </span>
        </div>
      </div>
    </div>
  );
}
