import test from 'node:test';
import assert from 'node:assert/strict';
import { sizeReason, whySession } from './planWhy.js';

const learned = { peak_window: [14, 17], focus_span_min: 100, focus_evidence: 6, avg_velocity: { deep_work: 1.3 } };
const six = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, day: 13 + i, startMin: 14 * 60, durationMin: 70 }));

test('the sizing sentence names the pace and the focus span, and says when they are only defaults', () => {
  const t = sizeReason({ sessions: six, learned });
  assert.match(t, /6 sittings of about 70 min/);
  assert.match(t, /30% over your estimates/);
  assert.match(t, /about 100 min at a time \(learned from 6 sessions\)/);
  assert.match(sizeReason({ sessions: six, learned: { ...learned, focus_evidence: 0 } }), /starting default/);
  assert.equal(sizeReason({ sessions: [], learned }), '');
});
test('a faster pace is said too', () => {
  assert.match(sizeReason({ sessions: six.slice(0, 1), learned: { ...learned, avg_velocity: { deep_work: .8 } } }), /1 sitting of about 70 min: you usually finish this kind of work early/);
});
test('a session in the focus window says so; one pushed out names what is in the way', () => {
  const ctx = { learned, events: [{ fixed: true, day: 14, startMin: 14 * 60, durationMin: 120, title: 'System design mock' }] };
  assert.match(whySession({ day: 13, startMin: 14 * 60 }, ctx), /in your focus window \(14:00 to 17:00\)/);
  assert.match(whySession({ day: 14, startMin: 12 * 60 }, ctx), /System design mock takes your focus window that day/);
  assert.match(whySession({ day: 15, startMin: 10 * 60 }, ctx), /your focus window was not free here/);
});
