-- Local test only. Run after 00_mock_supabase_auth.sql + schema.sql on an empty database; read the "expect" labels.
\set ON_ERROR_STOP 0
-- setup as superuser
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000000a','anh@x.com'),
 ('00000000-0000-0000-0000-00000000000b','b@x.com');
update profiles set is_admin=true where email='anh@x.com';
insert into projects(id,code,name,task_visibility) values
 ('10000000-0000-0000-0000-000000000001','P1','Own-vis project','own'),
 ('10000000-0000-0000-0000-000000000002','P2','All-vis project','all'),
 ('10000000-0000-0000-0000-000000000003','P3','Secret project','all');
insert into project_members(id,project_id,user_id,code,display_name,role) values
 ('20000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','TA','Anh','lead');
insert into project_members(id,project_id,code,display_name) values
 ('20000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-000000000001','B','Bee'),
 ('20000000-0000-0000-0000-00000000000c','10000000-0000-0000-0000-000000000001','C','Cee'),
 ('20000000-0000-0000-0000-0000000000b2','10000000-0000-0000-0000-000000000002','B','Bee');
insert into member_emails values ('20000000-0000-0000-0000-00000000000b','B@x.com'),('20000000-0000-0000-0000-0000000000b2','b@x.com');
-- C signs up later -> should link
insert into member_emails values ('20000000-0000-0000-0000-00000000000c','c@x.com');
insert into auth.users(id,email) values ('00000000-0000-0000-0000-00000000000c','C@X.com');
select 'link check', code, user_id is not null as linked from project_members order by project_id, code;
insert into tasks(id,project_id,title,assignee_id,due_date) values
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','B task','20000000-0000-0000-0000-00000000000b', current_date+3),
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','C task','20000000-0000-0000-0000-00000000000c', current_date-1),
 ('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002','P2 other task',null,null),
 ('30000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000003','P3 task',null,null);
insert into lead_notes values ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','secret');
insert into resources(id,project_id,title,tier) values
 ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Raw data','restricted'),
 ('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Manuscript','collaborative'),
 ('40000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Lit db','controlled'),
 ('40000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','Analysis','controlled');
insert into resource_access values ('40000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-00000000000b');

-- ===== act as B =====
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select 'B projects (expect P1,P2)', string_agg(code, ',' order by code) from projects;
select 'B tasks (expect B task, P2 other task)', string_agg(title, ' | ' order by title) from tasks;
select 'B lead notes (expect 0)', count(*) from lead_notes;

select 'B emails visible (expect only own 2)', count(*) from member_emails;
select 'B profiles (expect 1)', count(*) from profiles;
select 'B resources (expect Lit db, Manuscript)', string_agg(title, ',' order by title) from resources;
update tasks set status='done' where id='30000000-0000-0000-0000-000000000001';
select 'B direct update affected nothing? status=', status from tasks where id='30000000-0000-0000-0000-000000000001';
select report_progress('30000000-0000-0000-0000-000000000002','in_progress',50,'hack');  -- expect error (not mine)
select report_progress('30000000-0000-0000-0000-000000000001','done',100,'x');           -- expect error (done)
select report_progress('30000000-0000-0000-0000-000000000001','in_progress',40,'Đã đọc 8/20 bài');
select report_progress('30000000-0000-0000-0000-000000000001','submitted',90,'Nộp ở WPS 01');
select 'B task now', status, progress, completed_at=current_date from tasks where id='30000000-0000-0000-0000-000000000001';
select 'B sees log', count(*) from task_updates;
insert into submissions(project_id,task_id,member_id,author_id,link,note) values
 ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b','https://kdocs.cn/x','my file');
insert into submissions(project_id,member_id,author_id,link) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000b','spoof'); -- expect RLS error
update submissions set review_status='accepted';  -- expect error
update profiles set is_admin=true;                 -- expect error
insert into projects(code,name) values ('X','x'); -- expect RLS error
-- ===== act as C =====
reset role; set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000c';
select 'C sees submissions (expect 0)', count(*) from submissions;
select 'C tasks (expect C task only)', string_agg(title, ',') from tasks;
select 'C sees log of B (expect 0)', count(*) from task_updates;
-- ===== act as admin A =====
reset role; set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
select 'A projects (expect 3)', count(*) from projects;
select 'A subs (expect 1)', count(*) from submissions;
update submissions set review_status='accepted', review_note='ok';
select 'A reviewed', review_status, reviewed_at is not null from submissions;
update tasks set status='done' where id='30000000-0000-0000-0000-000000000001';
select 'A approved', status, progress, approved_at is not null from tasks where id='30000000-0000-0000-0000-000000000001';
select 'A log', new_status, new_progress, note from task_updates order by id;
select 'A lead notes (expect 1)', count(*) from lead_notes;
select set_member_email('20000000-0000-0000-0000-00000000000c','');
reset role;
