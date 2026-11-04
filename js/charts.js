// Small SVG/HTML chart helpers. Colours come from CSS tokens (see app.css):
// --st-done (aqua), --st-submitted (orange), --st-in_progress (blue) are the three
// validated categorical slots; not_started is the neutral track, on_hold is the
// hatched neutral. Every chart has a legend or direct labels plus a table elsewhere.
import { t } from './i18n.js';
import { esc, parseD, todayStr, taskTitle, effProgress, isOverdue, fmtDate } from './util.js';

export const STACK_ORDER = ['done', 'submitted', 'in_progress', 'not_started', 'on_hold'];

export function meter(value, label) {
  const v = Math.max(0, Math.min(100, value || 0));
  return `<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(v)}" aria-label="${esc(label || t('progress'))}">
    <div class="meter-fill" style="width:${v}%"></div></div>`;
}

export function ring(value, size = 84) {
  const v = Math.max(0, Math.min(100, value || 0));
  const r = (size - 10) / 2, c = 2 * Math.PI * r;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${Math.round(v)}%">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-track"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fill" stroke-dasharray="${(c * v / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="50%" dy="0.35em" text-anchor="middle" class="ring-text">${Math.round(v)}%</text></svg>`;
}

export function statusCounts(tasks) {
  const c = Object.fromEntries(STACK_ORDER.map(s => [s, 0]));
  tasks.forEach(x => { c[x.status] = (c[x.status] || 0) + 1; });
  return c;
}

// Segmented bar with legend. Hover shows "Status: n (x%)".
export function statusBar(tasks, { legend = true } = {}) {
  const c = statusCounts(tasks);
  const total = tasks.length || 1;
  const segs = STACK_ORDER.filter(s => c[s]).map(s => {
    const p = c[s] / total * 100;
    const tip = `${t('st_' + s)}: ${c[s]} (${Math.round(p)}%)`;
    return `<div class="seg st-bg-${s}" style="flex:${c[s]}" data-tip="${esc(tip)}" aria-label="${esc(tip)}">${p >= 9 ? c[s] : ''}</div>`;
  }).join('');
  const leg = legend ? `<div class="legend">${STACK_ORDER.filter(s => c[s]).map(s =>
    `<span><i class="sw st-bg-${s}"></i>${esc(t('st_' + s))} <b>${c[s]}</b></span>`).join('')}</div>` : '';
  return `<div class="stackbar" role="img" aria-label="${esc(t('byStatus'))}">${segs || '<div class="seg st-bg-not_started" style="flex:1"></div>'}</div>${leg}`;
}

// Horizontal bars: one row per phase, single series (progress %), direct-labelled.
export function phaseBars(rows) {
  return `<div class="hbars">${rows.map(r => `
    <div class="hbar-row" data-tip="${esc(`${r.label}: ${Math.round(r.value)}% · ${t('countTasks', { n: r.n })}`)}">
      <div class="hbar-label" title="${esc(r.label)}">${esc(r.label)}</div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${Math.max(r.value, r.value > 0 ? 1.5 : 0)}%"></div></div>
      <div class="hbar-val">${Math.round(r.value)}%</div>
    </div>`).join('')}</div>`;
}

// Workload per person: done hours vs remaining hours (two series, legend + direct label).
export function workloadBars(rows) {
  const max = Math.max(1, ...rows.map(r => r.hours));
  return `<div class="legend"><span><i class="sw wl-done"></i>${esc(t('hoursDone'))}</span><span><i class="sw wl-rest"></i>${esc(t('remaining'))}</span></div>
  <div class="hbars">${rows.map(r => `
    <div class="hbar-row" data-tip="${esc(`${r.member.display_name}: ${r.hoursDone}/${r.hours} h · ${r.done}/${r.assigned} ${t('tasks')}`)}">
      <div class="hbar-label">${esc(r.member.display_name)}</div>
      <div class="hbar-track plain"><div class="wl" style="width:${r.hours / max * 100}%">
        <div class="wl-done" style="flex:${r.hoursDone || 0.0001}"></div><div class="wl-rest" style="flex:${Math.max(0, r.hours - r.hoursDone) || 0.0001}"></div></div></div>
      <div class="hbar-val">${r.hoursDone}/${r.hours}h</div>
    </div>`).join('')}</div>`;
}

// Gantt timeline grouped by phase. Today marked by a vertical line.
export function gantt(tasks, members, phases) {
  const dated = tasks.filter(x => x.due_date);
  if (!dated.length) return `<p class="muted">${esc(t('noTasks'))}</p>`;
  const starts = dated.map(x => parseD(x.start_date || x.due_date));
  const ends = dated.map(x => parseD(x.due_date));
  let min = new Date(Math.min(...starts)), max = new Date(Math.max(...ends));
  const today = parseD(todayStr());
  if (today < min) min = today; if (today > max) max = today;
  min = new Date(min.getFullYear(), min.getMonth(), 1);
  max = new Date(max.getFullYear(), max.getMonth() + 1, 1);
  const span = max - min;
  const L = d => ((d - min) / span * 100).toFixed(3) + '%';
  const name = id => members.find(m => m.id === id)?.display_name || t('unassigned');

  const months = [];
  for (let d = new Date(min); d < max; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    months.push(`<div class="g-month" style="left:${L(d)}">${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}</div>`);
  }
  const order = [...phases, ...new Set(dated.map(x => x.phase || '—').filter(p => !phases.includes(p)))];
  const groups = order.map(p => [p, dated.filter(x => (x.phase || '—') === p)]).filter(g => g[1].length);
  const rows = groups.map(([p, list]) => `
    <div class="g-phase">${esc(p)}</div>
    ${list.map(x => {
      const s = parseD(x.start_date || x.due_date), e = new Date(parseD(x.due_date).getTime() + 86400000);
      const w = Math.max(0.6, (e - s) / span * 100);
      const od = isOverdue(x);
      const tip = `${taskTitle(x)} · ${name(x.assignee_id)} · ${fmtDate(x.start_date)} → ${fmtDate(x.due_date)} · ${t('st_' + x.status)} ${effProgress(x)}%${od ? ' · ⚠ ' + t('overdue') : ''}`;
      return `<div class="g-row" data-task="${esc(x.id)}" data-tip="${esc(tip)}" tabindex="0">
        <div class="g-label"><span>${esc(taskTitle(x))}</span><small>${esc(name(x.assignee_id))}</small></div>
        <div class="g-lane"><div class="g-bar st-bg-${x.status}${od ? ' od' : ''}" style="left:${L(s)};width:${w}%">
</div></div></div>`;
    }).join('')}`).join('');
  return `<div class="gantt">
    <div class="g-head"><div class="g-label"></div><div class="g-lane">${months.join('')}</div></div>
    <div class="g-body">${rows}<div class="g-today-wrap"><div class="g-label"></div><div class="g-lane"><div class="g-today" style="left:${L(today)}" title="${esc(t('today'))}"></div></div></div></div>
  </div>
  <div class="legend">${STACK_ORDER.map(s => `<span><i class="sw st-bg-${s}"></i>${esc(t('st_' + s))}</span>`).join('')}<span><i class="sw od-sw"></i>⚠ ${esc(t('overdue'))}</span></div>`;
}

// One shared tooltip for every [data-tip] element.
export function installTooltips() {
  const tip = document.createElement('div');
  tip.id = 'tip'; tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);
  const show = (el, x, y) => {
    tip.textContent = el.getAttribute('data-tip');
    tip.style.display = 'block';
    const r = tip.getBoundingClientRect();
    tip.style.left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x + 12)) + 'px';
    tip.style.top = (y + 16 + r.height > window.innerHeight ? y - r.height - 10 : y + 16) + 'px';
  };
  document.addEventListener('mousemove', e => {
    const el = e.target.closest?.('[data-tip]');
    if (el) show(el, e.clientX, e.clientY); else tip.style.display = 'none';
  });
  document.addEventListener('focusin', e => {
    const el = e.target.closest?.('[data-tip]');
    if (el) { const r = el.getBoundingClientRect(); show(el, r.left, r.bottom - 10); }
  });
  document.addEventListener('focusout', () => { tip.style.display = 'none'; });
}
