// Shared state, data loading, permissions and small UI primitives.
import { api } from './api.js';
import { t } from './i18n.js';
import { esc, toast } from './util.js';

export const state = {
  user: null, profile: null, uid: null,
  projects: [], members: [], tasks: [],
  extras: {},          // per project: updates, submissions, resources, access, credits, leadNotes, emails
  loaded: false,
};

export async function loadCore() {
  const d = await api.loadCore();
  state.uid = d.uid;
  state.projects = d.projects;
  state.members = d.members;
  state.tasks = d.tasks;
  state.loaded = true;
}

export async function loadExtras(pid, force = false) {
  if (!force && state.extras[pid]) return state.extras[pid];
  state.extras[pid] = await api.loadExtras(pid, isLead(pid));
  return state.extras[pid];
}

export const project = id => state.projects.find(p => p.id === id);
export const membersOf = pid => state.members.filter(m => m.project_id === pid);
export const tasksOf = pid => state.tasks.filter(x => x.project_id === pid);
export const myMember = pid => state.members.find(m => m.project_id === pid && m.user_id === state.uid && m.active);
export const isAdmin = () => !!state.profile?.is_admin;
export const isLead = pid => isAdmin() || myMember(pid)?.role === 'lead';
// Project type from the viewer's point of view: a member of a project I lead sees it as "taking part".
export const viewKind = p => (isLead(p.id) ? p.kind : 'collab');
export const memberName = id => state.members.find(m => m.id === id)?.display_name || '';
export const myTasks = () => state.tasks.filter(x => { const m = myMember(x.project_id); return m && x.assignee_id === m.id; });

export function navigate(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}

// Runs an async action, shows errors as a toast. Returns the result or undefined.
export async function guard(fn, okMsg) {
  try {
    const r = await fn();
    if (okMsg) toast(okMsg, 'ok');
    return r ?? true;
  } catch (e) {
    console.error(e);
    toast(t('error') + ': ' + (e.message || e), 'err');
    return undefined;
  }
}

export function openModal(html, { wide = false } = {}) {
  closeModal();
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true">
    <button class="icon-btn modal-x" data-close aria-label="${esc(t('close'))}">✕</button>${html}</div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('noscroll');
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) closeModal(); });
  wrap.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModal));
  const first = wrap.querySelector('input:not([type=hidden]),select,textarea');
  if (first) setTimeout(() => first.focus(), 30);
  return wrap.querySelector('.modal');
}
export function closeModal() {
  document.querySelectorAll('.modal-wrap').forEach(x => x.remove());
  document.body.classList.remove('noscroll');
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

export function formData(form) {
  const o = {};
  new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; });
  return o;
}
export const nul = v => (v === '' || v === undefined ? null : v);

export function options(list, selected, { blank } = {}) {
  return (blank !== undefined ? `<option value="">${esc(blank)}</option>` : '') +
    list.map(o => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(v)}"${String(v) === String(selected ?? '') ? ' selected' : ''}>${esc(l)}</option>`;
    }).join('');
}

export function field(label, inner, cls = '') {
  return `<label class="field ${cls}"><span>${esc(label)}</span>${inner}</label>`;
}
