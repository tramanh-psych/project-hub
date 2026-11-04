// Backend adapter. Same interface for Supabase (real) and the in-browser demo.
import { demoBackend } from './demo.js';

function supabaseBackend(url, key) {
  const sb = window.supabase.createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const ok = ({ data, error }) => { if (error) throw error; return data; };
  let uid = null;

  return {
    mode: 'live',
    async getSession() {
      const { data } = await sb.auth.getSession();
      uid = data.session?.user?.id || null;
      return data.session?.user || null;
    },
    onAuthChange(cb) { sb.auth.onAuthStateChange((ev, s) => { uid = s?.user?.id || null; cb(ev, s?.user || null); }); },
    async signIn(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); },
    async signUp(email, password, full_name) {
      return ok(await sb.auth.signUp({ email, password, options: { data: { full_name }, emailRedirectTo: location.origin + location.pathname } }));
    },
    async signOut() { await sb.auth.signOut(); },
    async resetPassword(email) { ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })); },
    async updatePassword(password) { ok(await sb.auth.updateUser({ password })); },
    async getProfile() { return ok(await sb.from('profiles').select('*').eq('id', uid).single()); },
    async updateProfile(patch) { return ok(await sb.from('profiles').update(patch).eq('id', uid).select().single()); },

    async loadCore() {
      const [projects, members, tasks] = await Promise.all([
        sb.from('projects').select('*').order('created_at'),
        sb.from('project_members').select('*').order('created_at'),
        sb.from('tasks').select('*').order('due_date', { ascending: true, nullsFirst: false }),
      ]);
      return { projects: ok(projects), members: ok(members), tasks: ok(tasks), uid };
    },
    async loadExtras(pid, lead) {
      const q = (tbl, sel = '*') => sb.from(tbl).select(sel).eq('project_id', pid);
      const jobs = {
        updates: q('task_updates').order('created_at', { ascending: false }).limit(500),
        submissions: q('submissions').order('created_at', { ascending: false }),
        resources: q('resources').order('folder'),
        credits: q('credit_roles'),
      };
      if (lead) jobs.leadNotes = q('lead_notes');
      const keys = Object.keys(jobs);
      const res = await Promise.all(keys.map(k => jobs[k]));
      const out = {};
      keys.forEach((k, i) => { out[k] = ok(res[i]); });
      const rids = out.resources.map(r => r.id);
      out.access = rids.length ? ok(await sb.from('resource_access').select('*').in('resource_id', rids)) : [];
      out.emails = [];
      if (lead) {
        const mids = (await sb.from('project_members').select('id').eq('project_id', pid)).data?.map(m => m.id) || [];
        if (mids.length) out.emails = ok(await sb.from('member_emails').select('*').in('member_id', mids));
      }
      out.leadNotes = out.leadNotes || [];
      return out;
    },
    async insert(table, row) { return ok(await sb.from(table).insert(row).select().single()); },
    async update(table, id, patch) { return ok(await sb.from(table).update(patch).eq('id', id).select().single()); },
    async remove(table, id) { ok(await sb.from(table).delete().eq('id', id)); },
    async removeWhere(table, match) { ok(await sb.from(table).delete().match(match)); },
    async upsert(table, row, onConflict) { return ok(await sb.from(table).upsert(row, { onConflict }).select().single()); },
    async reportProgress(task, status, progress, note) {
      ok(await sb.rpc('report_progress', { p_task: task, p_status: status, p_progress: progress, p_note: note || null }));
    },
    async setMemberEmail(member, email) { ok(await sb.rpc('set_member_email', { p_member: member, p_email: email || '' })); },
  };
}

const cfg = window.HUB_CONFIG || {};
const forceDemo = new URLSearchParams(location.search).has('demo');
export const api = (!forceDemo && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase)
  ? supabaseBackend(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
  : demoBackend();
