// Optional: daily email reminders for deadlines.
// Sends each person one email listing their tasks that are overdue or due in the next 3 days.
//
// Deploy:  supabase functions deploy deadline-reminder --no-verify-jwt
// Secrets: supabase secrets set RESEND_API_KEY=re_xxx MAIL_FROM="Project Hub <hub@yourdomain>" APP_URL=https://you.github.io/project-hub/ CRON_TOKEN=some-long-random-string
// Schedule: see README ("Nhắc hạn qua email").
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const L = {
  vi: { subj: 'Nhắc hạn công việc', over: 'Quá hạn', soon: 'Sắp đến hạn', due: 'hạn', open: 'Mở trang quản lý' },
  zh: { subj: '任务截止提醒', over: '已逾期', soon: '即将到期', due: '截止', open: '打开项目管理' },
  en: { subj: 'Deadline reminder', over: 'Overdue', soon: 'Due soon', due: 'due', open: 'Open Project Hub' },
};
const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

Deno.serve(async req => {
  if (req.headers.get('x-cron-token') !== Deno.env.get('CRON_TOKEN')) return new Response('forbidden', { status: 403 });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const today = new Date().toISOString().slice(0, 10);
  const in3 = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

  const { data: tasks, error } = await sb.from('tasks')
    .select('id,title,title_zh,due_date,status,project_id,assignee_id')
    .in('status', ['not_started', 'in_progress']).not('assignee_id', 'is', null).lte('due_date', in3);
  if (error) return new Response(error.message, { status: 500 });

  const { data: members } = await sb.from('project_members').select('id,user_id,project_id').not('user_id', 'is', null);
  const { data: profiles } = await sb.from('profiles').select('id,email,full_name,lang');
  const { data: projects } = await sb.from('projects').select('id,code,archived');
  const byUser = new Map<string, { p: any; items: any[] }>();
  for (const x of tasks ?? []) {
    const m = members?.find(m => m.id === x.assignee_id);
    const proj = projects?.find(p => p.id === x.project_id);
    if (!m || !proj || proj.archived) continue;
    const prof = profiles?.find(p => p.id === m.user_id);
    if (!prof) continue;
    const e = byUser.get(prof.id) ?? { p: prof, items: [] };
    e.items.push({ ...x, code: proj.code });
    byUser.set(prof.id, e);
  }

  let sent = 0;
  for (const { p, items } of byUser.values()) {
    const s = L[(p.lang as keyof typeof L)] ?? L.vi;
    const row = (x: any) => `<li>[${esc(x.code)}] ${esc(p.lang === 'zh' && x.title_zh ? x.title_zh : x.title)} — ${s.due} ${x.due_date}</li>`;
    const over = items.filter(x => x.due_date < today), soon = items.filter(x => x.due_date >= today);
    const html = `<p>${esc(p.full_name || '')},</p>
      ${over.length ? `<h3 style="color:#b42626">⚠ ${s.over}</h3><ul>${over.map(row).join('')}</ul>` : ''}
      ${soon.length ? `<h3>⏰ ${s.soon}</h3><ul>${soon.map(row).join('')}</ul>` : ''}
      <p><a href="${esc(Deno.env.get('APP_URL') || '')}">${s.open}</a></p>`;
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: Deno.env.get('MAIL_FROM'), to: p.email, subject: `${s.subj} (${items.length})`, html }),
    });
    if (r.ok) sent++;
  }
  return Response.json({ people: byUser.size, sent });
});
