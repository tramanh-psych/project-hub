// In-browser demo backend with sample data. Mirrors the database rules
// (who sees what) so the member view can be previewed before Supabase is set up.
import { iso } from './util.js';

const KEY = 'hub.demo.v1';
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now());
const day = n => iso(new Date(Date.now() + n * 86400000));

function sample() {
  const U = {
    anh: { id: 'u-anh', email: 'anh@example.com', full_name: 'Anh (bạn)', is_admin: true, lang: 'vi' },
    lan: { id: 'u-lan', email: 'lan@example.com', full_name: 'Lan', is_admin: false, lang: 'vi' },
    wei: { id: 'u-wei', email: 'wei@example.com', full_name: '王伟', is_admin: false, lang: 'zh' },
    mei: { id: 'u-mei', email: 'mei@example.com', full_name: '李梅', is_admin: false, lang: 'zh' },
    chen: { id: 'u-chen', email: 'chen@example.com', full_name: 'Dr. Chen', is_admin: false, lang: 'en' },
  };
  const P1 = 'p-hcb', P2 = 'p-fbw', P3 = 'p-ptsd';
  const projects = [
    { id: P1, code: 'HCB2027', name: 'Houcan Cup 2027 · 厚璨杯 (demo)', kind: 'led', color: '#2a78d6',
      description: 'Forced-choice questionnaire study for the Houcan Cup competition.',
      phases: ['0. Kick-off', '1. Constructs & items', '2. Simulation & prep', '3. Ethics & registration', '4. Pre-study', '5. Wave 1'],
      categories: ['Coordination', 'Literature & language', 'Data collection', 'AI & methods', 'Analysis & writing'],
      task_visibility: 'all', links: [{ label: 'WPS 进度表', url: 'https://www.kdocs.cn/' }], checklist: { ck1: true, ck3: true },
      start_date: day(-35), end_date: day(200), archived: false, my_role: null, agreement_url: '', created_at: day(-35) },
    { id: P2, code: 'FBW', name: 'Familiar but wrong (demo)', kind: 'collab', color: '#eb6834',
      description: 'Collaboration led by another researcher.', my_role: 'Data analysis',
      phases: ['Design', 'Data', 'Writing'], categories: ['Analysis', 'Writing'], task_visibility: 'own',
      links: [], checklist: {}, start_date: day(-60), end_date: day(120), archived: false, agreement_url: '', created_at: day(-60) },
    { id: P3, code: 'PTSD', name: 'PTSD (cá nhân, demo)', kind: 'personal', color: '#1baf7a',
      description: 'Luận văn / dự án cá nhân.', phases: ['Đề cương', 'Thu thập dữ liệu', 'Phân tích', 'Viết'],
      categories: ['Đọc tài liệu', 'Viết', 'Phân tích'], task_visibility: 'own', links: [{ label: 'Google Drive', url: 'https://drive.google.com/' }],
      checklist: {}, start_date: day(-90), end_date: day(150), archived: false, my_role: null, agreement_url: '', created_at: day(-90) },
  ];
  const M = (project_id, user, code, role, title) => ({ id: 'm-' + project_id + '-' + code, project_id, user_id: user ? user.id : null,
    code, display_name: user ? user.full_name : code, role, title, responsibilities: '', agreement_signed: null, active: true, created_at: day(-30) });
  const members = [
    M(P1, U.anh, 'TA', 'lead', 'Coordinator, analysis'), M(P1, U.lan, 'LAN', 'member', 'Literature & language'),
    M(P1, U.wei, 'WEI', 'member', 'Data collection'), M(P1, U.mei, 'MEI', 'member', 'Fieldwork & presentation'),
    { ...M(P1, null, 'LU', 'member', 'AI advisor (external)'), display_name: 'Advisor L.' },
    M(P2, U.chen, 'CHEN', 'lead', 'PI'), M(P2, U.anh, 'TA', 'member', 'Data analysis'),
    M(P3, U.anh, 'TA', 'lead', 'Author'),
  ];
  const mid = (p, c) => 'm-' + p + '-' + c;
  const T = (project_id, phase, category, title, title_zh, who, s, d, h, status, progress, extra = {}) => ({
    id: uuid(), project_id, ref: null, phase, category, title, title_zh, assignee_id: who ? mid(project_id, who) : null,
    start_date: day(s), due_date: day(d), est_hours: h, status, progress, deliverable: extra.deliverable || '',
    criteria: extra.criteria || '', submit_where: extra.submit_where || '', completed_at: status === 'done' || status === 'submitted' ? day(extra.doneAt ?? d - 1) : null,
    approved_at: status === 'done' ? day(extra.doneAt ?? d - 1) : null, created_at: day(-30), updated_at: day(-1) });
  const tasks = [
    T(P1, '0. Kick-off', 'Coordination', 'Finalize team, set up WeChat group and shared folder', '确定成员，建立微信群和共享文件夹', 'TA', -34, -5, 2, 'done', 100, { deliverable: 'Team list' }),
    T(P1, '0. Kick-off', 'Coordination', 'Invite faculty advisor(s)', '邀请指导教师', 'TA', -3, 26, 3, 'in_progress', 40, { deliverable: 'Advisor confirmation' }),
    T(P1, '0. Kick-off', 'Literature & language', 'Download English papers and upload to shared folder', '下载英文文献并上传至共享文件夹', 'TA', -3, 26, 6, 'in_progress', 60),
    T(P1, '0. Kick-off', 'Literature & language', 'Search CNKI, upload Chinese papers', '在知网检索中文文献并上传', 'LAN', -3, 2, 6, 'in_progress', 30, { deliverable: '20 relevant papers', criteria: 'Peer-reviewed, 2015+', submit_where: 'WPS · 3-Literature' }),
    T(P1, '0. Kick-off', 'Literature & language', 'Search CNKI, upload Chinese papers', '在知网检索中文文献并上传', 'WEI', -3, -2, 6, 'not_started', 0, { deliverable: '20 relevant papers', submit_where: 'WPS · 3-Literature' }),
    T(P1, '0. Kick-off', 'Literature & language', 'Summarize priority (★) papers', '完成重点文献摘要', 'TA', -6, 41, 20, 'in_progress', 35),
    T(P1, '0. Kick-off', 'Literature & language', 'Claim and summarize papers', '认领并完成文献摘要', 'MEI', -3, 6, 12, 'submitted', 90, { doneAt: -1, submit_where: 'WPS · 3-Literature' }),
    T(P1, '1. Constructs & items', 'AI & methods', 'Draft construct definitions', '撰写构念定义', 'TA', 10, 40, 10, 'not_started', 0),
    T(P1, '1. Constructs & items', 'Literature & language', 'Translate item pool to Chinese', '题目翻译为中文', 'LAN', 20, 55, 8, 'not_started', 0, { deliverable: 'Translated item pool (docx)' }),
    T(P1, '2. Simulation & prep', 'AI & methods', 'Thurstonian IRT simulation', 'Thurstonian IRT 模拟', 'TA', 30, 75, 25, 'not_started', 0),
    T(P1, '3. Ethics & registration', 'Coordination', 'Ethics application', '伦理申请', 'TA', 45, 90, 12, 'not_started', 0),
    T(P1, '3. Ethics & registration', 'Data collection', 'Set up Credamo survey', '设置 Credamo 问卷', 'WEI', 50, 95, 8, 'not_started', 0),
    T(P1, '4. Pre-study', 'Data collection', 'Recruit pilot sample (n=100)', '招募预研究样本 (n=100)', 'MEI', 95, 130, 15, 'not_started', 0, { deliverable: '100 valid responses' }),
    T(P1, '5. Wave 1', 'Analysis & writing', 'Wave 1 analysis', '第一波数据分析', 'TA', 140, 180, 30, 'not_started', 0),
    T(P2, 'Design', 'Analysis', 'Power analysis', null, 'TA', -40, -20, 6, 'done', 100, { doneAt: -22 }),
    T(P2, 'Data', 'Analysis', 'Clean wave 1 data', null, 'TA', -10, 5, 10, 'in_progress', 50),
    T(P2, 'Writing', 'Writing', 'Methods section draft', null, 'CHEN', 10, 40, 12, 'not_started', 0),
    T(P3, 'Đề cương', 'Viết', 'Hoàn thiện đề cương', null, 'TA', -80, -40, 30, 'done', 100, { doneAt: -42 }),
    T(P3, 'Thu thập dữ liệu', 'Phân tích', 'Thu thập 150 phiếu PCL-5', null, 'TA', -30, 1, 40, 'in_progress', 70),
    T(P3, 'Phân tích', 'Phân tích', 'Phân tích CFA', null, 'TA', 5, 45, 30, 'not_started', 0),
    T(P3, 'Viết', 'Viết', 'Viết chương Kết quả', null, 'TA', 40, 90, 40, 'not_started', 0),
  ];
  const meiTask = tasks.find(x => x.assignee_id === mid(P1, 'MEI'));
  const submissions = [
    { id: uuid(), project_id: P1, task_id: meiTask.id, member_id: mid(P1, 'MEI'), author_id: U.mei.id,
      link: 'https://www.kdocs.cn/l/example', note: '10 篇摘要已完成', review_status: 'pending', review_note: null, reviewed_at: null, created_at: day(-1) },
  ];
  const updates = [
    { id: 1, task_id: meiTask.id, project_id: P1, author_id: U.mei.id, member_id: mid(P1, 'MEI'), old_status: 'in_progress', new_status: 'submitted', old_progress: 60, new_progress: 90, note: '已提交到 WPS', created_at: new Date(Date.now() - 86400000).toISOString() },
  ];
  const resources = [
    { id: 'r1', project_id: P1, folder: '01_Administration', title: 'Phân công & biên bản', url: 'https://www.kdocs.cn/', tier: 'restricted', note: '' },
    { id: 'r2', project_id: P1, folder: '03_Raw_Data', title: 'Raw survey data', url: 'https://www.kdocs.cn/', tier: 'restricted', note: '' },
    { id: 'r3', project_id: P1, folder: '04_Processed_Data', title: 'Cleaned data (coded)', url: 'https://www.kdocs.cn/', tier: 'controlled', note: '' },
    { id: 'r4', project_id: P1, folder: '06_Manuscript', title: 'Manuscript draft', url: 'https://www.kdocs.cn/', tier: 'collaborative', note: '' },
    { id: 'r5', project_id: P1, folder: '00_Literature', title: 'Literature folder', url: 'https://www.kdocs.cn/', tier: 'controlled', note: '' },
  ];
  const access = [{ resource_id: 'r5', member_id: mid(P1, 'LAN') }, { resource_id: 'r3', member_id: mid(P1, 'WEI') }];
  const credits = [
    { id: uuid(), project_id: P1, member_id: mid(P1, 'TA'), role: 'Conceptualization', degree: 'lead', note: '' },
    { id: uuid(), project_id: P1, member_id: mid(P1, 'TA'), role: 'Methodology', degree: 'lead', note: '' },
    { id: uuid(), project_id: P1, member_id: mid(P1, 'LAN'), role: 'Investigation', degree: 'supporting', note: '' },
  ];
  const emails = members.filter(m => m.user_id).map(m => ({ member_id: m.id, email: Object.values(U).find(u => u.id === m.user_id).email }));
  return { users: Object.values(U), projects, members, tasks, submissions, updates, resources, access, credits, leadNotes: [], emails, current: 'u-anh', seq: 10 };
}

export function demoBackend() {
  let db;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  if (!db || !db.users) db = sample();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} };
  const me = () => db.users.find(u => u.id === db.current);
  const isAdmin = () => !!me()?.is_admin;
  const myMember = pid => db.members.find(m => m.project_id === pid && m.user_id === db.current && m.active);
  const isMember = pid => isAdmin() || !!myMember(pid);
  const isLead = pid => isAdmin() || myMember(pid)?.role === 'lead';
  const canSeeTask = x => {
    if (isLead(x.project_id)) return true;
    if (!isMember(x.project_id)) return false;
    const p = db.projects.find(p => p.id === x.project_id);
    return p.task_visibility === 'all' || x.assignee_id === myMember(x.project_id)?.id;
  };
  const TABLE = { projects: 'projects', project_members: 'members', tasks: 'tasks', submissions: 'submissions',
    resources: 'resources', resource_access: 'access', credit_roles: 'credits', lead_notes: 'leadNotes', task_updates: 'updates' };
  const tbl = name => db[TABLE[name]];
  const clone = x => JSON.parse(JSON.stringify(x));
  const log = (task, old, note) => {
    db.updates.unshift({ id: ++db.seq, task_id: task.id, project_id: task.project_id, author_id: db.current,
      member_id: myMember(task.project_id)?.id || null, old_status: old.status, new_status: task.status,
      old_progress: old.progress, new_progress: task.progress, note: note || null, created_at: new Date().toISOString() });
  };
  const taskRules = (x, old) => {
    if (x.status === 'done') { x.progress = 100; if (!x.completed_at) x.completed_at = iso(new Date()); if (old.status !== 'done') x.approved_at = new Date().toISOString(); }
    else if (x.status === 'submitted') { if (!x.completed_at) x.completed_at = iso(new Date()); x.approved_at = null; }
    else { x.approved_at = null; if (['submitted', 'done'].includes(old.status)) x.completed_at = null; }
    x.updated_at = new Date().toISOString();
  };

  return {
    mode: 'demo',
    demoUsers: () => db.users.map(u => ({ id: u.id, name: u.full_name })),
    demoCurrent: () => db.current,
    demoSwitch(id) { db.current = id; save(); },
    demoReset() { localStorage.removeItem(KEY); db = sample(); save(); },
    async getSession() { return me() ? { id: db.current, email: me().email } : null; },
    onAuthChange() {},
    async signIn() {}, async signUp() { return {}; }, async signOut() {}, async resetPassword() {}, async updatePassword() {}, async resetMemberPassword() { return { ok: true }; },
    async getProfile() { return clone(me()); },
    async updateProfile(patch) { Object.assign(me(), patch); save(); return clone(me()); },
    async loadCore() {
      return {
        uid: db.current,
        projects: clone(db.projects.filter(p => isMember(p.id))),
        members: clone(db.members.filter(m => isMember(m.project_id))),
        tasks: clone(db.tasks.filter(canSeeTask)),
      };
    },
    async loadExtras(pid, lead) {
      const mm = myMember(pid)?.id;
      const mineTask = id => { const x = db.tasks.find(x => x.id === id); return x && x.assignee_id === mm; };
      return clone({
        updates: db.updates.filter(u => u.project_id === pid && (lead || u.author_id === db.current || mineTask(u.task_id))),
        submissions: db.submissions.filter(s => s.project_id === pid && (lead || s.author_id === db.current)),
        resources: db.resources.filter(r => r.project_id === pid && (lead || r.tier === 'collaborative' || db.access.some(a => a.resource_id === r.id && a.member_id === mm))),
        access: db.access.filter(a => db.resources.some(r => r.id === a.resource_id && r.project_id === pid) && (lead || a.member_id === mm)),
        credits: db.credits.filter(c => c.project_id === pid && (lead || c.member_id === mm)),
        leadNotes: lead ? db.leadNotes.filter(n => n.project_id === pid) : [],
        emails: lead ? db.emails.filter(e => db.members.some(m => m.id === e.member_id && m.project_id === pid)) : [],
      });
    },
    async insert(table, row) {
      const r = { id: uuid(), created_at: new Date().toISOString(), ...row };
      if (table === 'tasks') r.updated_at = r.created_at;
      if (table === 'submissions') { r.author_id = db.current; r.review_status = 'pending'; }
      tbl(table).push(r); save(); return clone(r);
    },
    async update(table, id, patch) {
      const key = table === 'lead_notes' ? 'task_id' : 'id';
      const r = tbl(table).find(x => x[key] === id);
      if (!r) throw new Error('not found');
      const old = { ...r };
      Object.assign(r, patch);
      if (table === 'tasks') { taskRules(r, old); if (r.status !== old.status || r.progress !== old.progress) log(r, old); }
      if (table === 'submissions' && patch.review_status && patch.review_status !== old.review_status) r.reviewed_at = new Date().toISOString();
      save(); return clone(r);
    },
    async remove(table, id) {
      const list = tbl(table); const i = list.findIndex(x => x.id === id);
      if (i >= 0) list.splice(i, 1);
      if (table === 'projects') for (const k of ['members', 'tasks', 'submissions', 'resources', 'credits', 'updates', 'leadNotes']) db[k] = db[k].filter(x => x.project_id !== id);
      if (table === 'project_members') db.tasks.forEach(x => { if (x.assignee_id === id) x.assignee_id = null; });
      save();
    },
    async removeWhere(table, match) {
      db[TABLE[table]] = tbl(table).filter(x => !Object.keys(match).every(k => x[k] === match[k])); save();
    },
    async upsert(table, row, onConflict) {
      const keys = onConflict.split(',');
      const list = tbl(table);
      const r = list.find(x => keys.every(k => x[k] === row[k]));
      if (r) Object.assign(r, row, { updated_at: new Date().toISOString() }); else list.push({ id: uuid(), ...row });
      save(); return clone(r || list[list.length - 1]);
    },
    async reportProgress(taskId, status, progress, note) {
      const x = db.tasks.find(x => x.id === taskId);
      if (!isLead(x.project_id)) {
        if (x.assignee_id !== myMember(x.project_id)?.id) throw new Error('you can only update tasks assigned to you');
        if (status === 'done') throw new Error('mark it "submitted"; the lead confirms "done"');
        if (x.status === 'done') throw new Error('this task is already confirmed done');
      }
      const old = { ...x };
      x.status = status; x.progress = Math.max(0, Math.min(100, progress));
      taskRules(x, old); log(x, old, note); save();
    },
    async setMemberEmail(memberId, email) {
      db.emails = db.emails.filter(e => e.member_id !== memberId);
      const m = db.members.find(m => m.id === memberId);
      if (email) {
        db.emails.push({ member_id: memberId, email: email.toLowerCase() });
        const u = db.users.find(u => u.email === email.toLowerCase());
        if (u) m.user_id = u.id;
      } else m.user_id = null;
      save();
    },
  };
}
