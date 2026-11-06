import { api } from './api.js';
import { t, setLang, getLang, LANGS } from './i18n.js';
import { esc, toast, todayStr, daysBetween, fmtDate, taskTitle, isOverdue, isClosed, overallProgress,
  dueBadge, statusPill, download, toIcs, linkHtml } from './util.js';
import { state, loadCore, project, tasksOf, myMember, isAdmin, isLead, viewKind, memberName, myTasks, navigate,
  guard, openModal, closeModal, formData, nul, options, field } from './core.js';
import { ring, statusBar, installTooltips } from './charts.js';
import { renderProject, openTask } from './project.js';

const app = document.getElementById('app');

// ---------------------------------------------------------------- boot
let booted = false;
async function boot() {
  if (!booted) {
    booted = true;
    installTooltips();
    api.onAuthChange(async (ev, user) => {
      if (ev === 'PASSWORD_RECOVERY') { renderSetPassword(); return; }
      if (ev === 'SIGNED_IN' && !state.user && user) { state.user = user; await afterLogin(); }
      if (ev === 'SIGNED_OUT') { state.user = null; state.loaded = false; renderAuth('login'); }
    });
  }
  setLang(getLang());
  try {
    state.user = await api.getSession();
  } catch (e) { app.innerHTML = `<div class="center-card"><p>${esc(t('offline'))}</p></div>`; return; }
  if (state.user) await afterLogin(); else renderAuth('login');
}

async function afterLogin() {
  // A lead set a temporary password for this person: they must choose their own first.
  if (state.user?.user_metadata?.must_change_password) { renderSetPassword({ forced: true }); return; }
  app.innerHTML = `<div class="center-card muted">${esc(t('loading'))}</div>`;
  const ok = await guard(async () => {
    state.profile = await api.getProfile();
    if (state.profile?.lang && !localStorage.getItem('hub.lang')) setLang(state.profile.lang);
    await loadCore();
  });
  if (!ok) { renderAuth('login'); return; }
  window.removeEventListener('hashchange', route);
  window.addEventListener('hashchange', route);
  route();
}

// Pick up other people's changes when the tab becomes visible again.
let lastLoad = Date.now();
document.addEventListener('visibilitychange', async () => {
  if (document.hidden || !state.loaded || document.querySelector('.modal-wrap') || Date.now() - lastLoad < 20000) return;
  lastLoad = Date.now();
  await guard(loadCore); state.extras = {}; route();
});

export async function refresh(pid) {
  lastLoad = Date.now();
  await guard(async () => {
    await loadCore();
    if (pid) delete state.extras[pid];
  });
  route();
}

// ---------------------------------------------------------------- auth screens
function langPicker(cls = '') {
  return `<select class="lang ${cls}" aria-label="${esc(t('language'))}">${options(LANGS, getLang())}</select>`;
}
function bindLang(root, rerender) {
  root.querySelectorAll('select.lang').forEach(s => s.addEventListener('change', async () => {
    setLang(s.value);
    if (state.profile && api.mode === 'live') guard(() => api.updateProfile({ lang: s.value }));
    rerender();
  }));
}

function renderAuth(mode) {
  const isUp = mode === 'signup', isReset = mode === 'reset';
  app.innerHTML = `<div class="auth">
    <form class="auth-card" novalidate>
      <div class="auth-top"><h1>${esc(t('app'))}</h1>${langPicker()}</div>
      ${api.mode === 'demo' ? `<p class="note">${esc(t('demoBanner'))}</p>` : ''}
      ${isUp ? field(t('fullName'), '<input name="name" autocomplete="name" required>') : ''}
      ${field(t('email'), '<input name="email" type="email" autocomplete="email" required>')}
      ${isReset ? `<p class="note">${esc(t('forgotHint'))}</p>` : ''}
      ${isReset ? '' : field(t('password'), `<input name="password" type="password" minlength="6" autocomplete="${isUp ? 'new-password' : 'current-password'}" required>`)}
      <button class="btn primary block" type="submit">${esc(isReset ? t('send') : isUp ? t('signup') : t('login'))}</button>
      <div class="auth-links">
        ${mode !== 'login' ? `<a href="#" data-mode="login">${esc(t('haveAccount'))}</a>` : `<a href="#" data-mode="signup">${esc(t('noAccount'))}</a>`}
        ${mode === 'login' ? `<a href="#" data-mode="reset">${esc(t('forgot'))}</a>` : ''}
      </div>
      <div class="auth-links"><a href="guide.html?lang=${getLang() === 'zh' ? 'zh' : 'vi'}" target="_blank" rel="noopener">❓ ${esc(t('guide'))}</a></div>
    </form></div>`;
  bindLang(app, () => renderAuth(mode));
  app.querySelectorAll('[data-mode]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); renderAuth(a.dataset.mode); }));
  app.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = formData(e.target);
    const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
    if (isReset) { if (await guard(() => api.resetPassword(f.email))) toast(t('resetSent'), 'ok'); }
    else if (isUp) {
      const r = await guard(() => api.signUp(f.email, f.password, f.name));
      if (r) { if (r.session) { state.user = r.session.user; await afterLogin(); return; } toast(t('signupDone'), 'ok'); renderAuth('login'); return; }
    } else {
      if (await guard(() => api.signIn(f.email, f.password))) {
        state.user = await api.getSession();
        if (state.user && !state.loaded) await afterLogin();
        return;
      }
    }
    btn.disabled = false;
  });
}

function renderSetPassword({ forced = false } = {}) {
  app.innerHTML = `<div class="auth"><form class="auth-card"><h1>${esc(t('setPassword'))}</h1>
    ${forced ? `<p class="note">${esc(t('mustChangeHint'))}</p>` : ''}
    ${field(t('newPassword'), '<input name="password" type="password" minlength="6" required autocomplete="new-password">')}
    <button class="btn primary block">${esc(t('save'))}</button>
    ${forced ? `<div class="auth-links"><a href="#" id="sp-out">${esc(t('logout'))}</a></div>` : ''}</form></div>`;
  app.querySelector('#sp-out')?.addEventListener('click', e => { e.preventDefault(); api.signOut(); });
  app.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault();
    if (await guard(() => api.updatePassword(formData(e.target).password), t('saved'))) {
      location.hash = '#/';
      state.user = await api.getSession();      // fresh copy, flag cleared
      await afterLogin();
    }
  });
}

// ---------------------------------------------------------------- layout + router
function shell(content, active) {
  const list = state.projects.filter(p => !p.archived);
  const groups = ['led', 'collab', 'personal'].map(k => [k, list.filter(p => viewKind(p) === k)]).filter(g => g[1].length);
  const demo = api.mode === 'demo' ? `<div class="demo-bar"><span>${esc(t('demoBanner'))}</span>
      <label>${esc(t('viewAs'))} <select id="demo-user">${options(api.demoUsers().map(u => [u.id, u.name]), api.demoCurrent())}</select></label>
      <button class="btn small ghost" id="demo-reset">${esc(t('resetDemo'))}</button></div>` : '';
  return `${demo}<div class="layout">
    <aside class="side" id="side">
      <a class="brand" href="#/">◆ ${esc(t('app'))}</a>
      <nav>
        <a href="#/" class="${active === 'dash' ? 'on' : ''}">${esc(t('dashboard'))}</a>
        ${groups.map(([k, ps]) => `<div class="nav-group">${esc(t('kind_' + k))}</div>
          ${ps.map(p => `<a href="#/p/${p.id}" class="${active === p.id ? 'on' : ''}"><i class="dot" style="background:${esc(p.color)}"></i>${esc(p.name)}</a>`).join('')}`).join('')}
        ${isAdmin() ? `<button class="btn small ghost block" id="new-project">＋ ${esc(t('newProject'))}</button>` : ''}
      </nav>
      <div class="side-foot">
        ${langPicker('small')}
        <a href="guide.html?lang=${getLang() === 'zh' ? 'zh' : 'vi'}" target="_blank" rel="noopener">❓ ${esc(t('guide'))}</a>
        <a href="#/profile" class="${active === 'profile' ? 'on' : ''}">👤 ${esc(state.profile?.full_name || state.profile?.email || '')}</a>
        ${api.mode === 'live' ? `<button class="btn small ghost" id="logout">${esc(t('logout'))}</button>` : ''}
      </div>
    </aside>
    <main class="main"><button class="icon-btn menu-btn" id="menu-btn" aria-label="menu">☰</button>${content}</main>
  </div>`;
}

function bindShell() {
  bindLang(app, route);
  app.querySelector('#logout')?.addEventListener('click', () => api.signOut());
  app.querySelector('#new-project')?.addEventListener('click', () => projectForm());
  app.querySelector('#menu-btn')?.addEventListener('click', () => app.querySelector('#side').classList.toggle('open'));
  app.querySelector('#demo-user')?.addEventListener('change', async e => {
    api.demoSwitch(e.target.value); state.extras = {};
    state.profile = await api.getProfile(); await loadCore(); route();
  });
  app.querySelector('#demo-reset')?.addEventListener('click', async () => {
    api.demoReset(); state.extras = {}; state.profile = await api.getProfile(); await loadCore(); navigate('#/');
  });
}

export function route() {
  if (!state.user) return;
  closeModal();
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  if (parts[0] === 'p' && project(parts[1])) {
    app.innerHTML = shell('<div id="view"></div>', parts[1]);
    bindShell();
    renderProject(app.querySelector('#view'), parts[1], parts[2] || 'overview', parts[3]);
  } else if (parts[0] === 'profile') {
    app.innerHTML = shell(profileView(), 'profile'); bindShell(); bindProfile();
  } else {
    app.innerHTML = shell(dashboard(), 'dash'); bindShell(); bindDashboard();
  }
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- dashboard
function dashboard() {
  const today = todayStr();
  const active = state.projects.filter(p => !p.archived);
  if (!active.length) return `<h1>${esc(t('dashboard'))}</h1><p class="empty">${esc(t('noProjects'))}</p>`;
  const mine = myTasks().filter(x => !isClosed(x) && x.status !== 'on_hold');
  const ledIds = new Set(active.filter(p => isLead(p.id)).map(p => p.id));
  const scope = state.tasks.filter(x => ledIds.has(x.project_id) || mine.includes(x));
  const overdue = scope.filter(x => isOverdue(x, today) && active.some(p => p.id === x.project_id));
  const soon = scope.filter(x => !isClosed(x) && x.due_date && x.due_date >= today && daysBetween(today, x.due_date) <= 7);
  const review = state.tasks.filter(x => x.status === 'submitted' && ledIds.has(x.project_id));
  const myOver = mine.filter(x => isOverdue(x, today));
  const mySoon = mine.filter(x => x.due_date && x.due_date >= today && daysBetween(today, x.due_date) <= 3);

  const reminder = (myOver.length || mySoon.length) ? `<div class="reminder">
      ${myOver.length ? `<span class="badge critical">⚠ ${esc(t('remindOverdue', { n: myOver.length }))}</span>` : ''}
      ${mySoon.length ? `<span class="badge warning">⏰ ${esc(t('remindSoon', { n: mySoon.length }))}</span>` : ''}</div>` : '';

  const kpi = (label, n, cls = '') => `<div class="kpi ${cls}"><div class="kpi-n">${n}</div><div class="kpi-l">${esc(label)}</div></div>`;
  const cards = active.map(p => {
    const ts = tasksOf(p.id);
    const od = ts.filter(x => isOverdue(x, today)).length;
    const done = ts.filter(x => x.status === 'done').length;
    const me = myMember(p.id);
    return `<a class="card pcard" href="#/p/${p.id}" style="--pc:${esc(p.color)}">
      <div class="pcard-top">${ring(overallProgress(ts), 72)}
        <div><span class="tag">${esc(t('kind_' + viewKind(p)))}</span><h3>${esc(p.name)}</h3>
          <div class="muted small">${esc(t('countTasks', { n: ts.length }))} · ${esc(t('done'))} ${done}${od ? ` · <b class="crit">⚠ ${od} ${esc(t('overdue'))}</b>` : ''}</div>
          ${me && !isLead(p.id) ? `<div class="muted small">${esc(t('role'))}: ${esc(me.title || t('role_member'))}</div>` : ''}
          ${p.kind === 'collab' && p.my_role ? `<div class="muted small">${esc(t('myRole'))}: ${esc(p.my_role)}</div>` : ''}
        </div></div>
      ${statusBar(ts, { legend: false })}
    </a>`;
  }).join('');

  const list = [...new Map([...overdue, ...soon, ...mine].map(x => [x.id, x])).values()]
    .filter(x => x.due_date)
    .sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 25);
  const rows = list.map(x => `<tr class="click" data-task="${esc(x.id)}" data-project="${esc(x.project_id)}">
      <td><i class="dot" style="background:${esc(project(x.project_id)?.color)}"></i>${esc(project(x.project_id)?.code)}</td>
      <td>${esc(taskTitle(x))}</td><td>${esc(memberName(x.assignee_id) || '–')}</td>
      <td>${statusPill(x.status)}</td><td class="nowrap">${fmtDate(x.due_date)} ${dueBadge(x)}</td></tr>`).join('');

  const reviewRows = review.map(x => `<tr class="click" data-task="${esc(x.id)}" data-project="${esc(x.project_id)}">
      <td>${esc(project(x.project_id)?.code)}</td><td>${esc(taskTitle(x))}</td><td>${esc(memberName(x.assignee_id))}</td><td>${fmtDate(x.completed_at)}</td></tr>`).join('');

  return `<div class="page-head"><h1>${esc(t('dashboard'))}</h1>
      <div class="actions"><button class="btn ghost" id="ics">📅 ${esc(t('exportIcs'))}</button></div></div>
    ${reminder}
    <div class="kpis">${kpi(t('kpiProjects'), active.length)}${kpi(t('kpiMyOpen'), mine.length)}
      ${kpi(t('kpiOverdue'), overdue.length, overdue.length ? 'crit' : '')}${kpi(t('kpiDueSoon'), soon.length)}
      ${ledIds.size ? kpi(t('kpiReview'), review.length) : ''}</div>
    <div class="cards">${cards}</div>
    ${reviewRows ? `<section class="panel"><h2>${esc(t('needsReview'))}</h2><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>${esc(t('projects'))}</th><th>${esc(t('task'))}</th><th>${esc(t('assignee'))}</th><th>${esc(t('completedAt'))}</th></tr></thead>
      <tbody>${reviewRows}</tbody></table></div></section>` : ''}
    <section class="panel"><h2>${esc(t('upcoming'))}</h2>
      ${rows ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(t('projects'))}</th><th>${esc(t('task'))}</th><th>${esc(t('assignee'))}</th><th>${esc(t('status'))}</th><th>${esc(t('due'))}</th></tr></thead>
      <tbody>${rows}</tbody></table></div>` : `<p class="muted">${esc(t('noUpcoming'))}</p>`}
    </section>`;
}

function bindDashboard() {
  app.querySelectorAll('tr[data-task]').forEach(tr => tr.addEventListener('click', () => openTask(tr.dataset.task)));
  app.querySelector('#ics')?.addEventListener('click', () => {
    const items = myTasks().filter(x => x.due_date && !isClosed(x)).map(x => ({
      id: x.id, due_date: x.due_date, title: taskTitle(x), project: project(x.project_id)?.code,
      desc: [x.deliverable, x.submit_where].filter(Boolean).join(' · '),
    }));
    download('my-deadlines.ics', toIcs(items), 'text/calendar');
  });
}

// ---------------------------------------------------------------- profile
function profileView() {
  const p = state.profile || {};
  return `<h1>${esc(t('profile'))}</h1>
  <form class="panel form narrow" id="pf">
    ${field(t('email'), `<input value="${esc(p.email)}" disabled>`)}
    ${field(t('fullName'), `<input name="full_name" value="${esc(p.full_name)}">`)}
    ${field(t('language'), `<select name="lang">${options(LANGS, p.lang || getLang())}</select>`)}
    <button class="btn primary">${esc(t('save'))}</button>
  </form>
  ${api.mode === 'live' ? `<form class="panel form narrow" id="pw">${field(t('newPassword'), '<input name="password" type="password" minlength="6" autocomplete="new-password">')}
    <button class="btn">${esc(t('setPassword'))}</button></form>` : ''}`;
}
function bindProfile() {
  app.querySelector('#pf').addEventListener('submit', async e => {
    e.preventDefault();
    const f = formData(e.target);
    const r = await guard(() => api.updateProfile({ full_name: f.full_name, lang: f.lang }), t('saved'));
    if (r) { state.profile = r; setLang(f.lang); route(); }
  });
  app.querySelector('#pw')?.addEventListener('submit', async e => {
    e.preventDefault();
    await guard(() => api.updatePassword(formData(e.target).password), t('saved'));
    e.target.reset();
  });
}

// ---------------------------------------------------------------- project create/edit (shared)
export function projectForm(p = null) {
  const v = p || { kind: 'led', color: '#2a78d6', phases: [], categories: [], task_visibility: 'all', links: [] };
  const m = openModal(`<h2>${esc(p ? t('settings') : t('newProject'))}</h2>
    <form class="form grid2" id="projf">
      ${field(t('projName'), `<input name="name" required value="${esc(v.name)}">`)}
      ${field(t('projCode'), `<input name="code" required value="${esc(v.code)}" pattern="[A-Za-z0-9_\\-]+" placeholder="HCB2027">`)}
      ${field(t('kind'), `<select name="kind">${options(['led', 'collab', 'personal'].map(k => [k, t('kind_' + k)]), v.kind)}</select>`)}
      ${field(t('myRole'), `<input name="my_role" value="${esc(v.my_role)}">`)}
      ${field(t('startDate'), `<input type="date" name="start_date" value="${esc(v.start_date)}">`)}
      ${field(t('endDate'), `<input type="date" name="end_date" value="${esc(v.end_date)}">`)}
      ${field(t('description'), `<textarea name="description" rows="2">${esc(v.description)}</textarea>`, 'span2')}
      ${field(t('phases'), `<textarea name="phases" rows="5">${esc((v.phases || []).join('\n'))}</textarea>`)}
      ${field(t('categories'), `<textarea name="categories" rows="5">${esc((v.categories || []).join('\n'))}</textarea>`)}
      ${field(t('visibility'), `<select name="task_visibility">${options([['all', t('vis_all')], ['own', t('vis_own')]], v.task_visibility)}</select>`)}
      ${field(t('color'), `<input type="color" name="color" value="${esc(v.color)}">`)}
      ${field(t('links'), `<textarea name="links" rows="3" placeholder="WPS | https://www.kdocs.cn/...">${esc((v.links || []).map(l => l.label + ' | ' + l.url).join('\n'))}</textarea>`, 'span2')}
      ${field(t('agreementUrl'), `<input name="agreement_url" value="${esc(v.agreement_url)}" placeholder="https://">`, 'span2')}
      ${p ? `<label class="check span2"><input type="checkbox" name="archived" ${v.archived ? 'checked' : ''}> ${esc(t('archived'))}</label>` : ''}
      <div class="span2 row-end">${p && isAdmin() ? `<button type="button" class="btn danger" id="delp">${esc(t('deleteProject'))}</button>` : ''}
        <span class="grow"></span><button type="button" class="btn ghost" data-close>${esc(t('cancel'))}</button>
        <button class="btn primary">${esc(t('save'))}</button></div>
    </form>`, { wide: true });
  m.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModal));
  m.querySelector('#delp')?.addEventListener('click', async () => {
    if (prompt(t('confirmDelProject')) !== p.code) return;
    if (await guard(() => api.remove('projects', p.id))) { closeModal(); await refresh(); navigate('#/'); }
  });
  m.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = formData(e.target);
    const lines = s => (s || '').split('\n').map(x => x.trim()).filter(Boolean);
    const row = {
      name: f.name, code: f.code.toUpperCase(), kind: f.kind, my_role: nul(f.my_role), start_date: nul(f.start_date),
      end_date: nul(f.end_date), description: nul(f.description), phases: lines(f.phases), categories: lines(f.categories),
      task_visibility: f.task_visibility, color: f.color, agreement_url: nul(f.agreement_url),
      links: lines(f.links).map(l => { const [a, ...b] = l.split('|'); return b.length ? { label: a.trim(), url: b.join('|').trim() } : { label: l, url: l }; }),
    };
    if (p) row.archived = !!f.archived;
    const saved = await guard(async () => {
      if (p) return api.update('projects', p.id, row);
      const np = await api.insert('projects', row);
      // Creator becomes the lead member of the new project.
      await api.insert('project_members', { project_id: np.id, user_id: state.uid, code: 'ME',
        display_name: state.profile?.full_name || 'Me', role: 'lead', title: row.my_role });
      return np;
    }, t('saved'));
    if (saved) { closeModal(); await refresh(saved.id); navigate('#/p/' + saved.id); }
  });
}

export { linkHtml };
boot();
