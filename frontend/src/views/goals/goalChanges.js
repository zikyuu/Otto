// Changes the wizard proposes to a goal. Nothing here runs on its own: each function takes a goal and returns a new one,
// and the page only calls them from a button the user presses. Big changes (a pivot, dropping milestones, a much later
// date) are marked `major` by the server and need an explicit approval step before they are applied.
import { daysBetween } from './goalMath.js';

let seq = 0;
const newId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

export function applyChange(goal, change, today) {
  switch (change.type) {
    case 'move_target':
      return { ...goal, target: change.to };
    case 'add_milestone':
      return { ...goal, milestones: [...goal.milestones, { id: newId(), title: change.title, effort_h: change.effort_h, due: change.due, done: false }] };
    case 'move_milestone':
      return { ...goal, milestones: goal.milestones.map(m => (m.id === change.milestone_id ? { ...m, due: change.due } : m)) };
    case 'drop_milestone':
      return { ...goal, milestones: goal.milestones.filter(m => m.id !== change.milestone_id || m.done) };      // finished work is never dropped
    case 'pivot':
      return {
        ...goal, title: change.new_title || goal.title,
        milestones: [...goal.milestones.filter(m => m.done), ...(change.milestones || []).map(m => ({ id: newId(), title: m.title, effort_h: m.effort_h, due: m.due, done: false }))],
        detours: [...(goal.detours || []), { date: today, type: 'pivot', text: change.why || `Changed direction to: ${change.new_title}` }],
      };
    default:
      return goal;
  }
}

export const applyChanges = (goal, changes, today) => changes.reduce((g, c) => applyChange(g, c, today), goal);

// one line, in words, for the person who has to approve it
export function describeChange(goal, c) {
  const title = id => goal.milestones.find(m => m.id === id)?.title || 'a milestone';
  switch (c.type) {
    case 'move_target': return `Move the target date from ${goal.target} to ${c.to} (${daysBetween(goal.target, c.to) > 0 ? `${daysBetween(goal.target, c.to)} days later` : `${-daysBetween(goal.target, c.to)} days earlier`}).`;
    case 'add_milestone': return `Add a milestone: ${c.title} (${c.effort_h}h, due ${c.due}).`;
    case 'move_milestone': return `Move "${title(c.milestone_id)}" to ${c.due}.`;
    case 'drop_milestone': return `Drop the milestone "${title(c.milestone_id)}".`;
    case 'pivot': return `Change direction to "${c.new_title}": ${(c.milestones || []).length} new milestone${(c.milestones || []).length === 1 ? '' : 's'} replace the ones not done yet.`;
    default: return '';
  }
}

// the milestones that would disappear or change if these were applied: shown before a big change is approved
export function overhaulSummary(goal, changes) {
  const dropped = changes.filter(c => c.type === 'drop_milestone').map(c => goal.milestones.find(m => m.id === c.milestone_id)).filter(m => m && !m.done);
  const pivot = changes.find(c => c.type === 'pivot');
  const replaced = pivot ? goal.milestones.filter(m => !m.done) : [];
  return { dropped, replaced, added: [...changes.filter(c => c.type === 'add_milestone'), ...(pivot?.milestones || [])], retitle: pivot?.new_title && pivot.new_title !== goal.title ? pivot.new_title : null };
}

export const needsPermission = changes => changes.some(c => c.major);
export const splitByScale = changes => ({ minor: changes.filter(c => !c.major), major: changes.filter(c => c.major) });

// a brand new goal proposed by the wizard, ready to add (it is a proposal until the user approves it)
export function goalFromProposal(p, today, id = `g${Date.now()}`) {
  return {
    id, title: p.title, cat: p.cat || 'Personal', start: today, target: p.target, hours_per_week: p.hours_per_week || 4, detours: [],
    milestones: (p.milestones || []).map(m => ({ id: newId(), title: m.title, effort_h: m.effort_h, due: m.due, done: false })),
  };
}
