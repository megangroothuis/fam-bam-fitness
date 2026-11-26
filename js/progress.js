// How a goal is scored. Every goal is measured over its own period:
//   daily / days -> the Mon–Sun week, one "hit" per day
//   weekly       -> the Mon–Sun week, count (check) or total (amount)
//   monthly      -> the calendar month, count or total
import {
  weekStart, weekEnd, monthStart, monthEnd, range, dow, maxISO, minISO,
  DOW_SHORT, WEEK_ORDER, monthName, todayISO, daysInMonth,
} from './dates.js';

const num = (n) => (Math.round(Number(n) * 100) / 100).toLocaleString();
const unitOf = (g) => (g.unit || '').trim();

export function isActiveOn(goal, iso) {
  if (goal.start_date > iso) return false;
  if (goal.archived_at && goal.archived_at.slice(0, 10) <= iso) return false;
  return true;
}

// Did this single log count as a "hit"?
export function isHit(goal, log) {
  if (!log) return false;
  if (goal.kind === 'amount') {
    const a = Number(log.amount || 0);
    return goal.cadence === 'daily' || goal.cadence === 'days' ? a >= Number(goal.target) : a > 0;
  }
  return !!log.done;
}

export function isScheduledOn(goal, iso) {
  if (goal.cadence === 'daily') return true;
  if (goal.cadence === 'days') return (goal.days_of_week || []).includes(dow(iso));
  return false;
}

export function cadenceText(g) {
  const u = unitOf(g);
  const amt = g.kind === 'amount' ? `${num(g.target)}${u ? ' ' + u : ''}` : '';
  switch (g.cadence) {
    case 'daily': return amt ? `${amt} every day` : 'Every day';
    case 'days': {
      const days = WEEK_ORDER.filter((d) => (g.days_of_week || []).includes(d)).map((d) => DOW_SHORT[d]).join(' · ');
      return amt ? `${amt} on ${days}` : days || 'Pick some days';
    }
    case 'weekly': return amt ? `${amt} a week` : `${num(g.target)}× a week`;
    case 'monthly': return amt ? `${amt} a month` : `${num(g.target)}× a month`;
  }
  return '';
}

// ref = the day we're looking from (selected day, or today / week end on the Fam page)
export function progress(goal, logs, ref) {
  const mine = logs.filter((l) => l.goal_id === goal.id);
  const u = unitOf(goal);
  let done = 0, target = 0, text = '', pace = 1;

  if (goal.cadence === 'monthly') {
    const ms = monthStart(ref), me = monthEnd(ref);
    const inMonth = mine.filter((l) => l.log_date >= ms && l.log_date <= me);
    done = goal.kind === 'amount'
      ? inMonth.reduce((s, l) => s + Number(l.amount || 0), 0)
      : inMonth.filter((l) => l.done).length;
    target = Number(goal.target);
    // "on pace": how far through the month we are (counting from the goal's start)
    const from = maxISO(ms, goal.start_date);
    const upTo = minISO(me, maxISO(ref, from));
    const elapsed = range(from, upTo).length;
    const span = range(from, me).length || daysInMonth(ref);
    pace = Math.max(elapsed / span, 0.0001);
    text = goal.kind === 'amount'
      ? `${num(done)} / ${num(target)}${u ? ' ' + u : ''} in ${monthName(ref)}`
      : `${num(done)} / ${num(target)} in ${monthName(ref)}`;
  } else {
    const ws = weekStart(ref), we = weekEnd(ref);
    const inWeek = mine.filter((l) => l.log_date >= ws && l.log_date <= we);
    if (goal.cadence === 'weekly') {
      done = goal.kind === 'amount'
        ? inWeek.reduce((s, l) => s + Number(l.amount || 0), 0)
        : inWeek.filter((l) => l.done).length;
      target = Number(goal.target);
      text = goal.kind === 'amount'
        ? `${num(done)} / ${num(target)}${u ? ' ' + u : ''} this week`
        : `${num(done)} / ${num(target)} this week`;
    } else {
      // daily / specific days: only days since the goal started count
      let end = we;
      if (goal.archived_at) end = minISO(end, goal.archived_at.slice(0, 10));
      const days = range(maxISO(ws, goal.start_date), end).filter((d) => isScheduledOn(goal, d));
      target = days.length;
      // a hit on an unscheduled day can make up for a missed one
      done = Math.min(inWeek.filter((l) => isHit(goal, l)).length, Math.max(target, 0));
      text = `${done} / ${target} day${target === 1 ? '' : 's'} this week`;
    }
  }
  const ratio = target > 0 ? Math.min(done / target, 1) : 0;
  const score = target > 0 ? Math.min(done / (target * pace), 1) : 0;
  return { done, target, ratio, score, text, complete: target > 0 && done >= target };
}

// Average across a member's goals for the week, 0..1
export function weekScore(goals, logs, ref) {
  const active = goals.filter((g) => g.start_date <= weekEnd(ref));
  if (!active.length) return { score: 0, complete: 0, onTrack: 0, total: 0 };
  const ps = active.map((g) => progress(g, logs, ref));
  return {
    score: ps.reduce((s, p) => s + p.score, 0) / ps.length,
    complete: ps.filter((p) => p.complete).length,
    onTrack: ps.filter((p) => p.score >= 0.999).length,
    total: ps.length,
  };
}

// For the little week strip: 0 = nothing, 1 = something logged, 2 = every goal due that day hit
export function dayState(goals, logs, iso) {
  const dayLogs = logs.filter((l) => l.log_date === iso);
  const anyHit = goals.some((g) => isHit(g, dayLogs.find((l) => l.goal_id === g.id)));
  if (!anyHit) return 0;
  const due = goals.filter((g) => isActiveOn(g, iso) && isScheduledOn(g, iso));
  if (due.length && due.every((g) => isHit(g, dayLogs.find((l) => l.goal_id === g.id)))) return 2;
  if (!due.length && iso <= todayISO()) return 2;
  return 1;
}
