import { t, getLang } from './i18n.js';

export const STATUSES = ['not_started', 'in_progress', 'submitted', 'done', 'on_hold'];
export const TIERS = ['collaborative', 'controlled', 'restricted'];
export const CREDIT_ROLES = [
  'Conceptualization', 'Data curation', 'Formal analysis', 'Funding acquisition', 'Investigation',
  'Methodology', 'Project administration', 'Resources', 'Software', 'Supervision', 'Validation',
  'Visualization', 'Writing – original draft', 'Writing – review & editing',
];
export const CHECKLIST = ['ck1', 'ck2', 'ck3', 'ck4', 'ck5', 'ck6', 'ck7', 'ck8'];

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// Only allow http(s) links to be rendered as hrefs.
export function safeUrl(u) {
  const s = String(u || '').trim();
  return /^https?:\/\//i.test(s) ? s : '';
}
export function linkHtml(u, label) {
  const s = safeUrl(u);
  return s ? `<a href="${esc(s)}" target="_blank" rel="noopener noreferrer">${esc(label || shortUrl(s))}</a>` : esc(label || u || '');
}
function shortUrl(u) { try { const x = new URL(u); return x.host + (x.pathname.length > 18 ? x.pathname.slice(0, 18) + '…' : x.pathname); } catch (e) { return u; } }

export function todayStr() { const d = new Date(); return iso(d); }
export function iso(d) { const z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; }
export function parseD(s) { if (!s) return null; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
export function daysBetween(a, b) { return Math.round((parseD(b) - parseD(a)) / 86400000); }
export function fmtDate(s) {
  if (!s) return '';
  const d = parseD(s);
  const l = getLang();
  return d.toLocaleDateString(l === 'zh' ? 'zh-CN' : l === 'vi' ? 'vi-VN' : 'en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
export function fmtDateTime(s) {
  if (!s) return '';
  const l = getLang();
  return new Date(s).toLocaleString(l === 'zh' ? 'zh-CN' : l === 'vi' ? 'vi-VN' : 'en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Title in the viewer's language when the task has one; English/original otherwise.
export function taskTitle(task) {
  const l = getLang();
  return (l === 'zh' && task.title_zh) || (l === 'vi' && task.title_vi) || task.title;
}
// The other-language titles, for a small subtitle (excludes the one already shown).
export function altTitles(task) {
  const main = taskTitle(task);
  return [task.title, task.title_zh, task.title_vi].filter((v, i, a) => v && v !== main && a.indexOf(v) === i);
}
export function isClosed(task) { return task.status === 'done' || task.status === 'submitted'; }
export function isOverdue(task, today = todayStr()) {
  return !isClosed(task) && task.status !== 'on_hold' && task.due_date && task.due_date < today;
}
export function effProgress(task) { return task.status === 'done' ? 100 : (task.progress || 0); }

// Hours-weighted progress, same rule as the original sheet.
export function overallProgress(tasks) {
  if (!tasks.length) return 0;
  const h = tasks.reduce((s, x) => s + Number(x.est_hours || 0), 0);
  if (h > 0) return tasks.reduce((s, x) => s + Number(x.est_hours || 0) * effProgress(x), 0) / h;
  return tasks.reduce((s, x) => s + effProgress(x), 0) / tasks.length;
}

export function dueBadge(task) {
  if (task.status === 'done') {
    if (task.completed_at && task.due_date) {
      return task.completed_at <= task.due_date
        ? `<span class="badge good">${t('onTime')}</span>` : `<span class="badge serious">${t('late')}</span>`;
    }
    return '';
  }
  if (!task.due_date || task.status === 'submitted') return '';
  const n = daysBetween(todayStr(), task.due_date);
  if (n < 0) return `<span class="badge critical" title="${esc(t('overdue'))}">⚠ ${esc(t('daysOver', { n: -n }))}</span>`;
  if (n === 0) return `<span class="badge warning">⏰ ${esc(t('today'))}</span>`;
  if (n <= 7) return `<span class="badge warning">⏰ ${esc(t('daysLeft', { n }))}</span>`;
  return `<span class="muted small">${esc(t('daysLeft', { n }))}</span>`;
}

export function statusPill(s) { return `<span class="pill st-${s}"><i></i>${esc(t('st_' + s))}</span>`; }

export function memberStats(members, tasks) {
  const today = todayStr();
  const rows = members.map(m => {
    const mine = tasks.filter(x => x.assignee_id === m.id);
    const done = mine.filter(x => x.status === 'done');
    const dated = done.filter(x => x.completed_at && x.due_date);
    const onTime = dated.filter(x => x.completed_at <= x.due_date).length;
    const started = mine.filter(x => !x.start_date || x.start_date <= today);
    return {
      member: m,
      assigned: mine.length,
      done: done.length,
      overdue: mine.filter(x => isOverdue(x, today)).length,
      late: dated.length - onTime,
      onTimeRate: dated.length ? onTime / dated.length : null,
      progress: started.length ? overallProgress(started) : null,
      hours: mine.reduce((s, x) => s + Number(x.est_hours || 0), 0),
      hoursDone: done.reduce((s, x) => s + Number(x.est_hours || 0), 0),
    };
  });
  const total = rows.reduce((s, r) => s + r.hoursDone, 0);
  rows.forEach(r => { r.share = total ? r.hoursDone / total : null; });
  return rows;
}

// fraction 0..1 -> "42%"
export function pct(v) { return v == null ? '–' : Math.round(v * 100) + '%'; }

export function download(name, text, type = 'text/plain') {
  const blob = new Blob([text], { type: type + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function toIcs(items) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ProjectHub//EN', 'CALSCALE:GREGORIAN'];
  const fold = s => String(s).replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  for (const it of items) {
    const d = it.due_date.replace(/-/g, '');
    const next = iso(new Date(parseD(it.due_date).getTime() + 86400000)).replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${it.id}@projecthub`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`, `SUMMARY:${fold('[' + it.project + '] ' + it.title)}`,
      `DESCRIPTION:${fold(it.desc || '')}`,
      'BEGIN:VALARM', 'TRIGGER:-P2D', 'ACTION:DISPLAY', `DESCRIPTION:${fold(it.title)}`, 'END:VALARM',
      'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function toCsv(rows) {
  const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return '﻿' + rows.map(r => r.map(q).join(',')).join('\n');
}

let toastTimer;
export function toast(msg, kind = '') {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.className = 'show ' + kind; el.textContent = msg;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.className = ''; }, 3500);
}
