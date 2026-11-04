import { api } from './api.js';
import { t } from './i18n.js';
import { esc, todayStr, daysBetween, fmtDate, fmtDateTime, taskTitle, isOverdue, isClosed, overallProgress,
  effProgress, dueBadge, statusPill, memberStats, pct, download, toCsv, linkHtml, safeUrl,
  STATUSES, TIERS, CREDIT_ROLES, CHECKLIST, toast } from './util.js';
import { state, loadExtras, project, membersOf, tasksOf, myMember, isLead, viewKind, memberName, navigate,
  guard, openModal, closeModal, formData, nul, options, field } from './core.js';
import { ring, meter, statusBar, phaseBars, workloadBars, gantt } from './charts.js';
import { refresh, projectForm } from './main.js';

const TABS = ['overview', 'tasks', 'timeline', 'subs', 'resources', 'members', 'log', 'settings'];
const LEAD_TABS = new Set(['log', 'settings']);
let filters = {};   // per project task filters, kept while navigating

export async function renderProject(root, pid, tab, arg) {
  const p = project(pid);
  const lead = isLead(pid);
  if (!TABS.includes(tab) || (LEAD_TABS.has(tab) && !lead)) tab = 'overview';
  const tabs = TABS.filter(x => lead || !LEAD_TABS.has(x));
  root.innerHTML = `<div class="page-head">
      <div><span class="tag">${esc(t('kind_' + viewKind(p)))}</span>
      <h1><i class="dot big" style="background:${esc(p.color)}"></i>${esc(p.name)}</h1>
      ${p.description ? `<p class="muted">${esc(p.description)}</p>` : ''}</div>
      <div class="actions">${(p.links || []).filter(l => safeUrl(l.url)).map(l => `<a class="btn ghost small" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer">↗ ${esc(l.label)}</a>`).join('')}</div>
    </div>
    <nav class="tabs" role="tablist">${tabs.map(x => `<a role="tab" href="#/p/${pid}/${x}" class="${x === tab ? 'on' : ''}" aria-selected="${x === tab}">${esc(t('tab_' + x))}</a>`).join('')}</nav>
    <div id="tab" class="tab-body"><p class="muted">${esc(t('loading'))}</p></div>`;
  const body = root.querySelector('#tab');
  const ex = await guard(() => loadExtras(pid, true));   // always fresh when a tab opens
  if (!ex) return;
  const views = { overview, tasks: tasksTab, timeline, subs, resources, members, log, settings };
  views[tab](body, pid, ex, arg);
}

// ================================================================ overview
function overview(el, pid, ex) {
  const p = project(pid), ts = tasksOf(pid), lead = isLead(pid), today = todayStr();
  const phases = [...(p.phases || [])];
  ts.forEach(x => { if (x.phase && !phases.includes(x.phase)) phases.push(x.phase); });
  const rows = phases.map(ph => { const l = ts.filter(x => x.phase === ph); return { label: ph, value: overallProgress(l), n: l.length }; }).filter(r => r.n);
  const od = ts.filter(x => isOverdue(x, today));
  const soon = ts.filter(x => !isClosed(x) && x.due_date >= today && daysBetween(today, x.due_date) <= 14)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const stats = memberStats(membersOf(pid).filter(m => m.active), ts);
  const done = ts.filter(x => x.status === 'done').length;
  el.innerHTML = `<div class="grid-ov">
    <section class="panel center">
      <h2>${esc(t('overall'))}</h2>${ring(overallProgress(ts), 120)}
      <p class="muted small">${esc(t('byHours'))}</p>
      <p>${esc(t('done'))} <b>${done}</b>/${ts.length} · ${od.length ? `<b class="crit">⚠ ${od.length} ${esc(t('overdue'))}</b>` : `${esc(t('overdue'))}: 0`}</p>
    </section>
    <section class="panel span2"><h2>${esc(t('byStatus'))}</h2>${statusBar(ts)}
      <h2 class="mt">${esc(t('byPhase'))}</h2>${rows.length ? phaseBars(rows) : `<p class="muted">${esc(t('noTasks'))}</p>`}</section>
    <section class="panel span2"><h2>${esc(t('upcoming'))}</h2>${taskList([...od, ...soon], pid)}</section>
    ${lead ? `<section class="panel"><h2>${esc(t('byMember'))}</h2>${workloadBars(stats.filter(s => s.assigned))}</section>` : ''}
  </div>`;
  bindTaskRows(el);
}

function taskList(list, pid) {
  if (!list.length) return `<p class="muted">${esc(t('noUpcoming'))}</p>`;
  return `<ul class="tlist">${list.slice(0, 15).map(x => `<li class="click" data-task="${esc(x.id)}" tabindex="0">
    <span class="grow">${esc(taskTitle(x))} <small class="muted">· ${esc(memberName(x.assignee_id) || t('unassigned'))}</small></span>
    ${statusPill(x.status)} <span class="nowrap">${fmtDate(x.due_date)} ${dueBadge(x)}</span></li>`).join('')}</ul>`;
}

function bindTaskRows(el) {
  el.querySelectorAll('[data-task]').forEach(r => {
    r.addEventListener('click', e => { if (!e.target.closest('a,button,input,select')) openTask(r.dataset.task); });
    r.addEventListener('keydown', e => { if (e.key === 'Enter') openTask(r.dataset.task); });
  });
}

// ================================================================ tasks tab
function tasksTab(el, pid) {
  const p = project(pid), lead = isLead(pid), me = myMember(pid);
  const f = filters[pid] ||= { q: '', phase: '', who: '', status: '', mine: false, open: false };
  const ms = membersOf(pid);
  const draw = () => {
    let ts = tasksOf(pid);
    if (f.mine && me) ts = ts.filter(x => x.assignee_id === me.id);
    if (f.phase) ts = ts.filter(x => x.phase === f.phase);
    if (f.who) ts = ts.filter(x => (f.who === '-' ? !x.assignee_id : x.assignee_id === f.who));
    if (f.status === 'overdue') ts = ts.filter(x => isOverdue(x));
    else if (f.status) ts = ts.filter(x => x.status === f.status);
    if (f.open) ts = ts.filter(x => x.status !== 'done');
    if (f.q) { const q = f.q.toLowerCase(); ts = ts.filter(x => [x.title, x.title_zh, x.deliverable, x.category].join(' ').toLowerCase().includes(q)); }
    el.querySelector('#tbody').innerHTML = ts.length ? ts.map(x => `<tr class="click" data-task="${esc(x.id)}" tabindex="0">
        <td class="muted">${esc(x.ref ?? '')}</td>
        <td><div>${esc(taskTitle(x))}</div>${x.deliverable ? `<small class="muted">→ ${esc(x.deliverable)}</small>` : ''}</td>
        <td>${esc(memberName(x.assignee_id) || '–')}</td>
        <td class="hide-sm small">${esc(x.phase || '')}</td>
        <td class="nowrap">${fmtDate(x.due_date)}<br>${dueBadge(x)}</td>
        <td>${statusPill(x.status)}</td>
        <td class="w-prog">${meter(effProgress(x))}<small>${effProgress(x)}%</small></td></tr>`).join('')
      : `<tr><td colspan="7" class="muted">${esc(t('noTasks'))}</td></tr>`;
    el.querySelector('#count').textContent = t('countTasks', { n: ts.length });
    bindTaskRows(el.querySelector('#tbody'));
    el._shown = ts;
  };
  el.innerHTML = `<div class="toolbar">
      <input type="search" id="fq" placeholder="${esc(t('search'))}" value="${esc(f.q)}">
      <select id="fphase">${options(p.phases || [], f.phase, { blank: t('phase') + ': ' + t('all') })}</select>
      <select id="fwho">${options([...ms.map(m => [m.id, m.display_name]), ['-', t('unassigned')]], f.who, { blank: t('assignee') + ': ' + t('all') })}</select>
      <select id="fstatus">${options([...STATUSES.map(s => [s, t('st_' + s)]), ['overdue', '⚠ ' + t('overdue')]], f.status, { blank: t('status') + ': ' + t('all') })}</select>
      ${me ? `<label class="check"><input type="checkbox" id="fmine" ${f.mine ? 'checked' : ''}> ${esc(t('mine'))}</label>` : ''}
      <label class="check"><input type="checkbox" id="fopen" ${f.open ? 'checked' : ''}> ≠ ${esc(t('st_done'))}</label>
      <span class="grow"></span><span class="muted small" id="count"></span>
      <button class="btn ghost small" id="csv">⬇ ${esc(t('exportCsv'))}</button>
      ${lead ? `<button class="btn primary small" id="addt">＋ ${esc(t('addTask'))}</button>` : ''}
    </div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>${esc(t('title'))}</th><th>${esc(t('assignee'))}</th>
      <th class="hide-sm">${esc(t('phase'))}</th><th>${esc(t('due'))}</th><th>${esc(t('status'))}</th><th>${esc(t('progress'))}</th></tr></thead>
      <tbody id="tbody"></tbody></table></div>`;
  const on = (id, ev, fn) => el.querySelector(id)?.addEventListener(ev, fn);
  on('#fq', 'input', e => { f.q = e.target.value; draw(); });
  on('#fphase', 'change', e => { f.phase = e.target.value; draw(); });
  on('#fwho', 'change', e => { f.who = e.target.value; draw(); });
  on('#fstatus', 'change', e => { f.status = e.target.value; draw(); });
  on('#fmine', 'change', e => { f.mine = e.target.checked; draw(); });
  on('#fopen', 'change', e => { f.open = e.target.checked; draw(); });
  on('#addt', 'click', () => taskForm(pid));
  on('#csv', 'click', () => {
    const head = ['#', t('phase'), t('title'), t('titleZh'), t('category'), t('assignee'), t('start'), t('due'), t('hours'),
      t('status'), t('progress'), t('completedAt'), t('deliverable'), t('submitWhere')];
    const rows = el._shown.map(x => [x.ref, x.phase, x.title, x.title_zh, x.category, memberName(x.assignee_id), x.start_date, x.due_date,
      x.est_hours, t('st_' + x.status), effProgress(x), x.completed_at, x.deliverable, x.submit_where]);
    download(`${p.code}-tasks.csv`, toCsv([head, ...rows]), 'text/csv');
  });
  draw();
}

// ================================================================ task detail modal
export async function openTask(taskId) {
  const x = state.tasks.find(x => x.id === taskId);
  if (!x) return;
  const pid = x.project_id, lead = isLead(pid), me = myMember(pid);
  const ex = await guard(() => loadExtras(pid));
  if (!ex) return;
  const mine = me && x.assignee_id === me.id;
  const hist = ex.updates.filter(u => u.task_id === x.id);
  const subsHere = ex.submissions.filter(s => s.task_id === x.id);
  const note = ex.leadNotes.find(n => n.task_id === x.id)?.note || '';
  const canUpdate = (mine || lead) && !(x.status === 'done' && !lead);
  const statusChoices = (lead ? STATUSES : STATUSES.filter(s => s !== 'done')).map(s => [s, t('st_' + s)]);
  const kv = (k, v) => v ? `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>` : '';

  const m = openModal(`
    <div class="task-head"><h2>${esc(taskTitle(x))}</h2>
      ${x.title_zh && x.title_zh !== taskTitle(x) ? `<p class="muted">${esc(x.title_zh)}</p>` : ''}
      ${x.title_zh && taskTitle(x) === x.title_zh ? `<p class="muted">${esc(x.title)}</p>` : ''}
      <div class="row">${statusPill(x.status)} ${dueBadge(x)} <span class="muted small">${esc(project(pid).code)}</span></div></div>
    <dl class="kv">
      ${kv(t('assignee'), esc(memberName(x.assignee_id) || t('unassigned')))}
      ${kv(t('phase'), esc(x.phase))}${kv(t('category'), esc(x.category))}
      ${kv(t('start'), fmtDate(x.start_date))}${kv(t('due'), fmtDate(x.due_date))}
      ${kv(t('hours'), x.est_hours ? esc(x.est_hours) : '')}${kv(t('progress'), effProgress(x) + '%')}
      ${kv(t('completedAt'), fmtDate(x.completed_at))}${kv(t('approvedAt'), x.approved_at ? fmtDate(x.approved_at) : '')}
      ${kv(t('deliverable'), esc(x.deliverable))}${kv(t('criteria'), esc(x.criteria))}
      ${kv(t('submitWhere'), x.submit_where ? linkHtml(x.submit_where, x.submit_where) : '')}
    </dl>
    ${lead && x.status === 'submitted' ? `<div class="callout"><b>${esc(t('needsReview'))}</b>
      <input id="rvnote" placeholder="${esc(t('note'))}">
      <div class="row"><button class="btn primary" id="approve">✓ ${esc(t('approve'))}</button>
      <button class="btn" id="sendback">↺ ${esc(t('reopen'))}</button></div></div>` : ''}
    ${canUpdate ? `<form class="panel form" id="upd"><h3>${esc(t('updateProgress'))}</h3>
      <div class="grid2">${field(t('status'), `<select name="status">${options(statusChoices, x.status)}</select>`)}
      ${field(t('progress') + ' %', `<div class="row"><input type="range" name="progress" min="0" max="100" step="5" value="${effProgress(x)}"><output>${effProgress(x)}%</output></div>`)}</div>
      ${field(t('note'), `<textarea name="note" rows="2" placeholder="${esc(t('notePh'))}"></textarea>`)}
      ${!lead ? `<p class="muted small">${esc(t('memberDoneHint'))}</p>` : ''}
      <button class="btn primary">${esc(t('send'))}</button></form>` : ''}
    ${mine ? `<form class="panel form" id="sub"><h3>${esc(t('newSub'))}</h3>
      <p class="muted small">🔒 ${esc(t('subPrivate'))}</p>
      ${field(t('subLink'), '<input name="link" type="url" placeholder="https://www.kdocs.cn/l/..." required>')}
      ${field(t('subNote'), '<input name="note">')}
      <button class="btn">${esc(t('send'))}</button>
      ${subsHere.length ? subList(subsHere, pid, false) : ''}</form>` : ''}
    ${lead && subsHere.length ? `<div class="panel"><h3>${esc(t('tab_subs'))}</h3>${subList(subsHere, pid, true)}</div>` : ''}
    ${lead ? `<div class="panel form"><h3>🔒 ${esc(t('leadNote'))}</h3><textarea id="lnote" rows="2">${esc(note)}</textarea>
      <button class="btn small" id="savenote">${esc(t('save'))}</button></div>` : ''}
    <details class="panel"${hist.length ? '' : ' hidden'}><summary>${esc(t('history'))} (${hist.length})</summary>${histList(hist)}</details>
    ${lead ? `<div class="row-end"><button class="btn danger ghost" id="delt">${esc(t('del'))}</button><span class="grow"></span>
      <button class="btn" id="editt">✎ ${esc(t('edit'))}</button></div>` : ''}
  `, { wide: true });

  const after = async () => { closeModal(); await refresh(pid); };
  const range = m.querySelector('input[type=range]');
  range?.addEventListener('input', () => { range.nextElementSibling.textContent = range.value + '%'; });
  m.querySelector('select[name=status]')?.addEventListener('change', e => {
    if (e.target.value === 'submitted' && range && +range.value < 100) { range.value = 100; range.nextElementSibling.textContent = '100%'; }
  });
  m.querySelector('#upd')?.addEventListener('submit', async e => {
    e.preventDefault();
    const f = formData(e.target);
    if (await guard(() => api.reportProgress(x.id, f.status, +f.progress, f.note), t('saved'))) after();
  });
  m.querySelector('#sub')?.addEventListener('submit', async e => {
    e.preventDefault();
    const f = formData(e.target);
    if (await guard(() => api.insert('submissions', { project_id: pid, task_id: x.id, member_id: me.id, author_id: state.uid, link: f.link, note: nul(f.note) }), t('saved'))) after();
  });
  m.querySelector('#approve')?.addEventListener('click', async () => {
    if (await guard(() => api.reportProgress(x.id, 'done', 100, m.querySelector('#rvnote').value), t('saved'))) after();
  });
  m.querySelector('#sendback')?.addEventListener('click', async () => {
    const n = m.querySelector('#rvnote').value;
    if (await guard(() => api.reportProgress(x.id, 'in_progress', Math.min(x.progress, 90), n || t('reopen')), t('saved'))) after();
  });
  m.querySelector('#savenote')?.addEventListener('click', async () => {
    const v = m.querySelector('#lnote').value;
    if (await guard(() => api.upsert('lead_notes', { task_id: x.id, project_id: pid, note: v }, 'task_id'), t('saved'))) delete state.extras[pid];
  });
  m.querySelector('#editt')?.addEventListener('click', () => taskForm(pid, x));
  m.querySelector('#delt')?.addEventListener('click', async () => {
    if (confirm(t('confirmDel')) && await guard(() => api.remove('tasks', x.id))) after();
  });
  bindSubActions(m, pid);
}

function histList(hist) {
  if (!hist.length) return `<p class="muted">${esc(t('noLog'))}</p>`;
  return `<ul class="hist">${hist.map(u => `<li><span class="muted small">${fmtDateTime(u.created_at)}</span>
    <b>${esc(memberName(u.member_id) || '—')}</b>
    ${u.old_status !== u.new_status ? `${esc(t('st_' + u.old_status))} → ${statusPill(u.new_status)}` : ''}
    ${u.old_progress !== u.new_progress ? `<span class="small">${u.old_progress}% → ${u.new_progress}%</span>` : ''}
    ${u.note ? `<div class="hist-note">“${esc(u.note)}”</div>` : ''}</li>`).join('')}</ul>`;
}

function taskForm(pid, x = null) {
  const p = project(pid);
  const v = x || { status: 'not_started', progress: 0, est_hours: 0 };
  const ms = membersOf(pid).filter(m => m.active || m.id === v.assignee_id);
  const m = openModal(`<h2>${esc(x ? t('edit') : t('addTask'))}</h2>
    <form class="form grid2">
      ${field(t('title'), `<input name="title" required value="${esc(v.title)}">`, 'span2')}
      ${field(t('titleZh'), `<input name="title_zh" value="${esc(v.title_zh)}">`, 'span2')}
      ${field(t('phase'), `<input name="phase" list="phl" value="${esc(v.phase)}"><datalist id="phl">${options(p.phases || [])}</datalist>`)}
      ${field(t('category'), `<input name="category" list="catl" value="${esc(v.category)}"><datalist id="catl">${options(p.categories || [])}</datalist>`)}
      ${field(t('assignee'), `<select name="assignee_id">${options(ms.map(m => [m.id, `${m.display_name} (${m.code})`]), v.assignee_id, { blank: t('unassigned') })}</select>`)}
      ${field(t('hours'), `<input name="est_hours" type="number" min="0" step="0.5" value="${esc(v.est_hours)}">`)}
      ${field(t('start'), `<input name="start_date" type="date" value="${esc(v.start_date)}">`)}
      ${field(t('due'), `<input name="due_date" type="date" value="${esc(v.due_date)}">`)}
      ${field(t('status'), `<select name="status">${options(STATUSES.map(s => [s, t('st_' + s)]), v.status)}</select>`)}
      ${field(t('progress') + ' %', `<input name="progress" type="number" min="0" max="100" value="${esc(v.progress)}">`)}
      ${field(t('deliverable'), `<input name="deliverable" value="${esc(v.deliverable)}" placeholder="20 bài báo phù hợp">`, 'span2')}
      ${field(t('criteria'), `<input name="criteria" value="${esc(v.criteria)}">`, 'span2')}
      ${field(t('submitWhere'), `<input name="submit_where" value="${esc(v.submit_where)}" placeholder="WPS · 03_Raw_Data / https://...">`, 'span2')}
      <div class="span2 row-end"><span class="grow"></span><button type="button" class="btn ghost" data-close>${esc(t('cancel'))}</button>
      <button class="btn primary">${esc(t('save'))}</button></div>
    </form>`, { wide: true });
  m.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModal));
  m.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = formData(e.target);
    const row = { title: f.title, title_zh: nul(f.title_zh), phase: nul(f.phase), category: nul(f.category),
      assignee_id: nul(f.assignee_id), est_hours: +f.est_hours || 0, start_date: nul(f.start_date), due_date: nul(f.due_date),
      status: f.status, progress: Math.max(0, Math.min(100, +f.progress || 0)), deliverable: nul(f.deliverable),
      criteria: nul(f.criteria), submit_where: nul(f.submit_where) };
    const ok = await guard(() => x ? api.update('tasks', x.id, row) : api.insert('tasks', { ...row, project_id: pid }), t('saved'));
    if (ok) { closeModal(); await refresh(pid); }
  });
}

// ================================================================ timeline
function timeline(el, pid) {
  const p = project(pid);
  el.innerHTML = `<section class="panel">${gantt(tasksOf(pid), membersOf(pid), p.phases || [])}</section>`;
  el.querySelectorAll('.g-row').forEach(r => {
    r.addEventListener('click', () => openTask(r.dataset.task));
    r.addEventListener('keydown', e => { if (e.key === 'Enter') openTask(r.dataset.task); });
  });
  el.querySelector('.g-today')?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
}

// ================================================================ submissions (private)
function subList(list, pid, lead) {
  if (!list.length) return `<p class="muted">${esc(t('noSubs'))}</p>`;
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(t('date'))}</th>
    ${lead ? `<th>${esc(t('assignee'))}</th>` : ''}<th>${esc(t('task'))}</th><th>${esc(t('link'))}</th><th>${esc(t('review'))}</th><th></th></tr></thead><tbody>
    ${list.map(s => {
      const task = state.tasks.find(x => x.id === s.task_id);
      return `<tr><td class="nowrap small">${fmtDateTime(s.created_at)}</td>
      ${lead ? `<td>${esc(memberName(s.member_id))}</td>` : ''}
      <td>${task ? `<a href="#" data-open="${esc(task.id)}">${esc(taskTitle(task))}</a>` : `<span class="muted">${esc(t('noTask'))}</span>`}
        ${s.note ? `<div class="small muted">${esc(s.note)}</div>` : ''}</td>
      <td>${linkHtml(s.link)}</td>
      <td><span class="badge rv-${s.review_status}">${esc(t('rv_' + s.review_status))}</span>${s.review_note ? `<div class="small">${esc(s.review_note)}</div>` : ''}</td>
      <td class="nowrap">${lead ? `<button type="button" class="btn small" data-review="${esc(s.id)}">${esc(t('review'))}</button>` : ''}
        ${lead || (s.author_id === state.uid && s.review_status === 'pending') ? `<button type="button" class="icon-btn" data-delsub="${esc(s.id)}" aria-label="${esc(t('del'))}">🗑</button>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

function bindSubActions(root, pid) {
  root.querySelectorAll('[data-open]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); openTask(a.dataset.open); }));
  root.querySelectorAll('[data-delsub]').forEach(b => b.addEventListener('click', async () => {
    if (confirm(t('confirmDel')) && await guard(() => api.remove('submissions', b.dataset.delsub))) { closeModal(); await refresh(pid); }
  }));
  root.querySelectorAll('[data-review]').forEach(b => b.addEventListener('click', () => {
    const s = state.extras[pid].submissions.find(s => s.id === b.dataset.review);
    const m = openModal(`<h2>${esc(t('review'))}: ${esc(memberName(s.member_id))}</h2>
      <p>${linkHtml(s.link)}</p>${s.note ? `<p class="muted">${esc(s.note)}</p>` : ''}
      <form class="form">${field(t('note'), `<textarea name="review_note" rows="3">${esc(s.review_note)}</textarea>`)}
      <div class="row-end"><span class="grow"></span><button type="submit" name="r" value="revise" class="btn">↺ ${esc(t('revise'))}</button>
      <button type="submit" name="r" value="accepted" class="btn primary">✓ ${esc(t('accept'))}</button></div></form>`);
    m.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const r = e.submitter?.value || 'accepted';
      if (await guard(() => api.update('submissions', s.id, { review_status: r, review_note: nul(formData(e.target).review_note) }), t('saved'))) { closeModal(); await refresh(pid); }
    });
  }));
}

function subs(el, pid, ex) {
  const lead = isLead(pid), me = myMember(pid);
  const myOpen = me ? tasksOf(pid).filter(x => x.assignee_id === me.id && x.status !== 'done') : [];
  let showPending = false;
  const draw = () => {
    const list = ex.submissions.filter(s => !showPending || s.review_status === 'pending');
    el.querySelector('#sublist').innerHTML = subList(list, pid, lead);
    bindSubActions(el, pid);
  };
  el.innerHTML = `<p class="note">🔒 ${esc(t('subPrivate'))}</p>
    ${me ? `<form class="panel form" id="nsub"><h3>${esc(t('newSub'))}</h3><div class="grid2">
      ${field(t('task'), `<select name="task_id">${options(myOpen.map(x => [x.id, taskTitle(x)]), '', { blank: t('noTask') })}</select>`)}
      ${field(t('subLink'), '<input name="link" type="url" required placeholder="https://www.kdocs.cn/l/...">')}</div>
      ${field(t('subNote'), '<input name="note">')}<button class="btn primary">${esc(t('send'))}</button></form>` : ''}
    <section class="panel"><div class="row"><h2 class="grow">${esc(t('tab_subs'))}</h2>
      ${lead ? `<label class="check"><input type="checkbox" id="pend"> ${esc(t('rv_pending'))}</label>` : ''}</div>
      <div id="sublist"></div></section>`;
  el.querySelector('#pend')?.addEventListener('change', e => { showPending = e.target.checked; draw(); });
  el.querySelector('#nsub')?.addEventListener('submit', async e => {
    e.preventDefault();
    const f = formData(e.target);
    if (await guard(() => api.insert('submissions', { project_id: pid, task_id: nul(f.task_id), member_id: me.id, author_id: state.uid, link: f.link, note: nul(f.note) }), t('saved'))) refresh(pid);
  });
  draw();
}

// ================================================================ resources / access
function resources(el, pid, ex) {
  const lead = isLead(pid);
  const ms = membersOf(pid).filter(m => m.active && m.role !== 'lead');
  const has = (rid, mid) => ex.access.some(a => a.resource_id === rid && a.member_id === mid);
  const list = [...ex.resources].sort((a, b) => (a.folder || '').localeCompare(b.folder || '') || a.title.localeCompare(b.title));
  el.innerHTML = `<p class="note">${esc(t('tierHint'))}<br>${esc(t('accessNote'))}</p>
    ${lead ? `<div class="toolbar"><span class="grow"></span><button class="btn primary small" id="addr">＋ ${esc(t('addResource'))}</button></div>` : ''}
    ${list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(t('folder'))}</th><th>${esc(t('item'))}</th><th>${esc(t('tier'))}</th>
      ${lead ? ms.map(m => `<th class="center small" title="${esc(m.display_name)}">${esc(m.code)}</th>`).join('') + '<th></th>' : ''}</tr></thead><tbody>
      ${list.map(r => `<tr><td class="small">${esc(r.folder || '')}</td><td>${linkHtml(r.url, r.title)}${r.note ? `<div class="small muted">${esc(r.note)}</div>` : ''}</td>
        <td><span class="badge tier-${r.tier}">${r.tier === 'restricted' ? '🔒 ' : ''}${esc(t('tier_' + r.tier))}</span></td>
        ${lead ? ms.map(m => `<td class="center">${r.tier === 'collaborative' ? '<span class="muted">✓</span>'
          : `<input type="checkbox" data-r="${esc(r.id)}" data-m="${esc(m.id)}" ${has(r.id, m.id) ? 'checked' : ''} aria-label="${esc(m.display_name)}">`}</td>`).join('')
          + `<td class="nowrap"><button class="icon-btn" data-editr="${esc(r.id)}" aria-label="${esc(t('edit'))}">✎</button></td>` : ''}</tr>`).join('')}
      </tbody></table></div>` : `<p class="muted">${esc(t('noResources'))}</p>`}`;
  el.querySelectorAll('input[data-r]').forEach(c => c.addEventListener('change', async () => {
    const row = { resource_id: c.dataset.r, member_id: c.dataset.m };
    const ok = await guard(() => c.checked ? api.insert('resource_access', row) : api.removeWhere('resource_access', row));
    if (ok) { if (c.checked) ex.access.push(row); else ex.access = ex.access.filter(a => !(a.resource_id === row.resource_id && a.member_id === row.member_id)); }
    else c.checked = !c.checked;
  }));
  const form = r => {
    const v = r || { tier: 'controlled' };
    const m = openModal(`<h2>${esc(r ? t('edit') : t('addResource'))}</h2><form class="form grid2">
      ${field(t('folder'), `<input name="folder" value="${esc(v.folder)}" placeholder="03_Raw_Data">`)}
      ${field(t('tier'), `<select name="tier">${options(TIERS.map(x => [x, t('tier_' + x)]), v.tier)}</select>`)}
      ${field(t('item'), `<input name="title" required value="${esc(v.title)}">`, 'span2')}
      ${field(t('link'), `<input name="url" type="url" value="${esc(v.url)}" placeholder="https://">`, 'span2')}
      ${field(t('note'), `<input name="note" value="${esc(v.note)}">`, 'span2')}
      <div class="span2 row-end">${r ? `<button type="button" class="btn danger ghost" id="delr">${esc(t('del'))}</button>` : ''}<span class="grow"></span>
      <button class="btn primary">${esc(t('save'))}</button></div></form>`);
    m.querySelector('#delr')?.addEventListener('click', async () => {
      if (confirm(t('confirmDel')) && await guard(() => api.remove('resources', r.id))) { closeModal(); refresh(pid); }
    });
    m.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = formData(e.target);
      const row = { folder: nul(f.folder), tier: f.tier, title: f.title, url: nul(f.url), note: nul(f.note) };
      if (await guard(() => r ? api.update('resources', r.id, row) : api.insert('resources', { ...row, project_id: pid }), t('saved'))) { closeModal(); refresh(pid); }
    });
  };
  el.querySelector('#addr')?.addEventListener('click', () => form());
  el.querySelectorAll('[data-editr]').forEach(b => b.addEventListener('click', () => form(ex.resources.find(r => r.id === b.dataset.editr))));
}

// ================================================================ members
function members(el, pid, ex) {
  const lead = isLead(pid), me = myMember(pid);
  const ms = membersOf(pid);
  const email = id => ex.emails.find(e => e.member_id === id)?.email || '';
  const stats = memberStats(ms.filter(m => m.active), tasksOf(pid));
  const credit = (mid, role) => ex.credits.find(c => c.member_id === mid && c.role === role);
  const DEG = { lead: '●', equal: '◐', supporting: '○' };

  el.innerHTML = `
    <section class="panel"><div class="row"><h2 class="grow">${esc(t('tab_members'))}</h2>
      ${lead ? `<button class="btn primary small" id="addm">＋ ${esc(t('addMember'))}</button>` : ''}</div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(t('code'))}</th><th>${esc(t('name'))}</th><th>${esc(t('role'))}</th>
        <th>${esc(t('jobTitle'))}</th>${lead ? `<th>${esc(t('email'))}</th><th>${esc(t('agreement'))}</th><th></th>` : ''}</tr></thead><tbody>
      ${ms.map(m => `<tr class="${m.active ? '' : 'inactive'}"><td><b>${esc(m.code)}</b></td><td>${esc(m.display_name)}${m.id === me?.id ? ` <small class="muted">(${esc(t('me'))})</small>` : ''}</td>
        <td>${esc(t('role_' + m.role))}</td><td class="small">${esc(m.title || '')}${m.responsibilities ? `<div class="muted">${esc(m.responsibilities)}</div>` : ''}</td>
        ${lead ? `<td class="small">${esc(email(m.id))}<div>${m.user_id ? `<span class="badge good">✓ ${esc(t('linked'))}</span>` : `<span class="badge">${esc(t('notLinked'))}</span>`}</div></td>
        <td class="small">${m.agreement_signed ? '✓ ' + fmtDate(m.agreement_signed) : '–'}</td>
        <td><button class="icon-btn" data-editm="${esc(m.id)}" aria-label="${esc(t('edit'))}">✎</button></td>` : ''}</tr>`).join('')}
      </tbody></table></div></section>
    ${lead ? `<section class="panel"><h2>${esc(t('perf'))} <small class="muted">(${esc(t('leadOnly'))})</small></h2>
      <div class="tbl-wrap"><table class="tbl num"><thead><tr><th>${esc(t('name'))}</th><th>${esc(t('assigned'))}</th><th>${esc(t('done'))}</th>
        <th>${esc(t('overdue'))}</th><th>${esc(t('doneLate'))}</th><th>${esc(t('progress'))}</th><th>${esc(t('onTimeRate'))}</th>
        <th>${esc(t('hoursDone'))}</th><th>${esc(t('contribution'))}</th></tr></thead><tbody>
        ${stats.map(s => `<tr><td>${esc(s.member.display_name)}</td><td>${s.assigned}</td><td>${s.done}</td>
          <td>${s.overdue ? `<b class="crit">⚠ ${s.overdue}</b>` : 0}</td><td>${s.late}</td>
          <td>${s.progress == null ? '–' : Math.round(s.progress) + '%'}</td><td>${pct(s.onTimeRate)}</td>
          <td>${s.hoursDone}/${s.hours}</td><td>${pct(s.share)}</td></tr>`).join('')}</tbody></table></div>
      <h3 class="mt">${esc(t('byMember'))}</h3>${workloadBars(stats.filter(s => s.assigned))}</section>` : ''}
    <section class="panel"><h2>${esc(t('credit'))}</h2><p class="muted small">${esc(t('creditHint'))}
      ${lead ? ' · ' + Object.entries(DEG).map(([k, v]) => `${v} ${esc(t('deg_' + k))}`).join(' · ') : ''}</p>
      ${lead ? `<div class="tbl-wrap"><table class="tbl credit"><thead><tr><th></th>${ms.filter(m => m.active).map(m => `<th class="center">${esc(m.code)}</th>`).join('')}</tr></thead><tbody>
        ${CREDIT_ROLES.map(r => `<tr><td class="small">${esc(r)}</td>${ms.filter(m => m.active).map(m => {
          const c = credit(m.id, r);
          return `<td class="center"><button class="credit-cell" data-cm="${esc(m.id)}" data-cr="${esc(r)}" aria-label="${esc(m.code + ' ' + r)}">${c ? DEG[c.degree] : '·'}</button></td>`;
        }).join('')}</tr>`).join('')}</tbody></table></div>`
      : `<ul>${ex.credits.map(c => `<li>${esc(c.role)} — ${esc(t('deg_' + c.degree))}</li>`).join('') || `<li class="muted">–</li>`}</ul>`}
    </section>`;

  el.querySelectorAll('.credit-cell').forEach(b => b.addEventListener('click', async () => {
    const c = credit(b.dataset.cm, b.dataset.cr);
    const order = [null, 'supporting', 'equal', 'lead'];
    const next = order[(order.indexOf(c?.degree ?? null) + 1) % order.length];
    const ok = await guard(async () => {
      if (!next) { await api.remove('credit_roles', c.id); ex.credits = ex.credits.filter(x => x !== c); }
      else if (c) { await api.update('credit_roles', c.id, { degree: next }); c.degree = next; }
      else ex.credits.push(await api.insert('credit_roles', { project_id: pid, member_id: b.dataset.cm, role: b.dataset.cr, degree: next }));
    });
    if (ok) b.textContent = next ? DEG[next] : '·';
  }));

  const form = mem => {
    const v = mem || { role: 'member', active: true };
    const m = openModal(`<h2>${esc(mem ? t('edit') : t('addMember'))}</h2><form class="form grid2">
      ${field(t('code'), `<input name="code" required value="${esc(v.code)}" placeholder="YCQ">`)}
      ${field(t('name'), `<input name="display_name" required value="${esc(v.display_name)}">`)}
      ${field(t('email'), `<input name="email" type="email" value="${esc(mem ? email(mem.id) : '')}">`, 'span2')}
      <p class="muted small span2">${esc(t('emailHint'))}</p>
      ${field(t('role'), `<select name="role">${options([['member', t('role_member')], ['lead', t('role_lead')]], v.role)}</select>`)}
      ${field(t('agreement'), `<input name="agreement_signed" type="date" value="${esc(v.agreement_signed)}">`)}
      ${field(t('jobTitle'), `<input name="title" value="${esc(v.title)}">`, 'span2')}
      ${field(t('responsibilities'), `<textarea name="responsibilities" rows="2">${esc(v.responsibilities)}</textarea>`, 'span2')}
      <label class="check span2"><input type="checkbox" name="active" ${v.active ? 'checked' : ''}> ${esc(t('active'))}</label>
      <div class="span2 row-end">${mem ? `<button type="button" class="btn danger ghost" id="delm">${esc(t('del'))}</button>` : ''}<span class="grow"></span>
      <button class="btn primary">${esc(t('save'))}</button></div></form>`);
    m.querySelector('#delm')?.addEventListener('click', async () => {
      if (confirm(t('confirmDel')) && await guard(() => api.remove('project_members', mem.id))) { closeModal(); refresh(pid); }
    });
    m.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = formData(e.target);
      const row = { code: f.code.toUpperCase(), display_name: f.display_name, role: f.role, title: nul(f.title),
        responsibilities: nul(f.responsibilities), agreement_signed: nul(f.agreement_signed), active: !!f.active };
      const ok = await guard(async () => {
        const saved = mem ? await api.update('project_members', mem.id, row) : await api.insert('project_members', { ...row, project_id: pid });
        if ((f.email || '') !== (mem ? email(mem.id) : '')) await api.setMemberEmail(saved.id, f.email);
        return saved;
      }, t('saved'));
      if (ok) { closeModal(); refresh(pid); }
    });
  };
  el.querySelector('#addm')?.addEventListener('click', () => form());
  el.querySelectorAll('[data-editm]').forEach(b => b.addEventListener('click', () => form(ms.find(m => m.id === b.dataset.editm))));
}

// ================================================================ log (lead)
function log(el, pid, ex) {
  const task = id => state.tasks.find(x => x.id === id);
  el.innerHTML = `<section class="panel"><h2>${esc(t('log'))}</h2>
    ${ex.updates.length ? `<ul class="hist">${ex.updates.map(u => `<li><span class="muted small">${fmtDateTime(u.created_at)}</span>
      <b>${esc(memberName(u.member_id) || '—')}</b> · <a href="#" data-open="${esc(u.task_id)}">${esc(task(u.task_id) ? taskTitle(task(u.task_id)) : '…')}</a>
      ${u.old_status !== u.new_status ? `${esc(t('st_' + u.old_status))} → ${statusPill(u.new_status)}` : ''}
      ${u.old_progress !== u.new_progress ? `<span class="small">${u.old_progress}% → ${u.new_progress}%</span>` : ''}
      ${u.note ? `<div class="hist-note">“${esc(u.note)}”</div>` : ''}</li>`).join('')}</ul>` : `<p class="muted">${esc(t('noLog'))}</p>`}</section>`;
  el.querySelectorAll('[data-open]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); openTask(a.dataset.open); }));
}

// ================================================================ settings (lead)
function settings(el, pid) {
  const p = project(pid);
  const ck = p.checklist || {};
  const n = CHECKLIST.filter(k => ck[k]).length;
  el.innerHTML = `<section class="panel"><div class="row"><h2 class="grow">${esc(t('settings'))}</h2>
      <button class="btn" id="editp">✎ ${esc(t('edit'))}</button></div>
      <dl class="kv">
        <div><dt>${esc(t('projCode'))}</dt><dd>${esc(p.code)}</dd></div>
        <div><dt>${esc(t('kind'))}</dt><dd>${esc(t('kind_' + p.kind))}</dd></div>
        <div><dt>${esc(t('visibility'))}</dt><dd>${esc(t('vis_' + p.task_visibility))}</dd></div>
        <div><dt>${esc(t('startDate'))} – ${esc(t('endDate'))}</dt><dd>${fmtDate(p.start_date)} – ${fmtDate(p.end_date)}</dd></div>
        <div><dt>${esc(t('agreementUrl'))}</dt><dd>${p.agreement_url ? linkHtml(p.agreement_url) : '–'}</dd></div>
        <div><dt>${esc(t('links_'))}</dt><dd>${(p.links || []).map(l => linkHtml(l.url, l.label)).join(' · ') || '–'}</dd></div>
      </dl></section>
    <section class="panel"><h2>${esc(t('checklist'))} <small class="muted">${n}/${CHECKLIST.length}</small></h2>
      ${meter(n / CHECKLIST.length * 100, t('checklist'))}
      <div class="checklist">${CHECKLIST.map(k => `<label class="check"><input type="checkbox" data-ck="${k}" ${ck[k] ? 'checked' : ''}> ${esc(t(k))}</label>`).join('')}</div>
    </section>`;
  el.querySelector('#editp').addEventListener('click', () => projectForm(p));
  el.querySelectorAll('[data-ck]').forEach(c => c.addEventListener('change', async () => {
    const next = { ...(p.checklist || {}), [c.dataset.ck]: c.checked };
    const r = await guard(() => api.update('projects', pid, { checklist: next }));
    if (r) { p.checklist = next; settings(el, pid); } else c.checked = !c.checked;
  }));
}
