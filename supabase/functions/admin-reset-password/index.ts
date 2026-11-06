// Lets a project lead (or the admin) set a new temporary password for a member
// who forgot theirs. The member is forced to choose their own password at the next login.
//
// Why a function: changing someone else's password needs the service-role key,
// which must never reach the browser. This function checks who is calling first.
//
// Deploy: supabase functions deploy admin-reset-password --no-verify-jwt
// (the function verifies the caller itself, below).
//
// Who may reset whom
//   - never yourself (use the Account page), never an admin account;
//   - the admin may reset anyone else;
//   - a project lead may reset a member only if the lead leads EVERY project that
//     member belongs to, and the member is not a lead anywhere. Otherwise a lead
//     could take over an account that also has access to someone else's project.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Who is calling? (validated by the auth server, not just decoded)
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: me, error: meErr } = await admin.auth.getUser(token);
  if (meErr || !me?.user) return json({ error: 'not_signed_in' }, 401);
  const caller = me.user.id;

  // 2. What do they want?
  let body: { member_id?: string; password?: string };
  try { body = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const memberId = String(body.member_id ?? '');
  const password = String(body.password ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memberId)) return json({ error: 'bad_request' }, 400);
  if (password.length < 8 || password.length > 72) return json({ error: 'weak_password' }, 400);

  // 3. Is it allowed?
  const { data: target } = await admin.from('project_members').select('id, user_id').eq('id', memberId).maybeSingle();
  if (!target) return json({ error: 'not_found' }, 404);
  if (!target.user_id) return json({ error: 'no_account' }, 409);
  if (target.user_id === caller) return json({ error: 'use_account_page' }, 400);

  const { data: profiles } = await admin.from('profiles').select('id, is_admin').in('id', [caller, target.user_id]);
  const callerIsAdmin = !!profiles?.find(p => p.id === caller)?.is_admin;
  if (profiles?.find(p => p.id === target.user_id)?.is_admin) return json({ error: 'forbidden' }, 403);

  if (!callerIsAdmin) {
    const { data: memberships } = await admin.from('project_members')
      .select('project_id, role').eq('user_id', target.user_id).eq('active', true);
    if (!memberships?.length || memberships.some(m => m.role === 'lead')) return json({ error: 'forbidden' }, 403);
    const { data: led } = await admin.from('project_members')
      .select('project_id').eq('user_id', caller).eq('role', 'lead').eq('active', true);
    const ledIds = new Set((led ?? []).map(l => l.project_id));
    if (!memberships.every(m => ledIds.has(m.project_id))) return json({ error: 'forbidden' }, 403);
  }

  // 4. Do it. user_metadata is merged, so the person's name etc. is kept.
  const { error } = await admin.auth.admin.updateUserById(target.user_id, {
    password,
    user_metadata: { must_change_password: true },
  });
  if (error) return json({ error: 'update_failed', detail: error.message }, 500);

  console.log(`password reset: caller=${caller} member=${memberId}`); // never log the password
  return json({ ok: true });
});
