-- =====================================================================
-- Project Hub: database schema + row-level security for Supabase
-- Run once in Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Re-running is safe on an empty project; it drops nothing.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------

-- One row per login account (auto-created by trigger on sign-up).
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  lang        text not null default 'vi' check (lang in ('vi','zh','en')),
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Emails that become admin automatically on sign-up (not readable through the API).
create table if not exists public.admin_emails (
  email text primary key
);

create table if not exists public.projects (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,                 -- short id, e.g. HCB2027
  name            text not null,
  description     text,
  kind            text not null default 'led'
                  check (kind in ('led','collab','personal')),
  -- led: I am the lead; collab: someone else leads, I take part; personal: only me
  my_role         text,                                 -- what I do in a collab project
  start_date      date,
  end_date        date,
  color           text not null default '#3b6ef5',
  phases          text[] not null default '{}',         -- ordered phase names
  categories      text[] not null default '{}',         -- task categories
  task_visibility text not null default 'all'
                  check (task_visibility in ('all','own')),
  -- all: members see every task of the project; own: only tasks assigned to them
  links           jsonb not null default '[]',          -- [{label,url}] WPS / Drive / ...
  checklist       jsonb not null default '{}',          -- protection checklist state
  agreement_url   text,                                 -- collaboration agreement
  archived        boolean not null default false,
  created_at      timestamptz not null default now()
);

-- People in a project. user_id is null until that person creates an account;
-- it is linked automatically by matching member_emails.email.
create table if not exists public.project_members (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects(id) on delete cascade,
  user_id            uuid references auth.users(id) on delete set null,
  code               text not null,                     -- TA, YCQ, ...
  display_name       text not null,
  role               text not null default 'member' check (role in ('lead','member')),
  title              text,                              -- e.g. "Data collection"
  responsibilities   text,
  agreement_signed   date,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  unique (project_id, code),
  unique (project_id, user_id)
);

-- Emails kept apart so ordinary members never see each other's addresses.
create table if not exists public.member_emails (
  member_id  uuid primary key references public.project_members(id) on delete cascade,
  email      text not null
);

create table if not exists public.tasks (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  ref              integer,                             -- number from the old sheet
  phase            text,
  category         text,
  title            text not null,
  title_zh         text,
  assignee_id      uuid references public.project_members(id) on delete set null,
  start_date       date,
  due_date         date,
  est_hours        numeric(6,1) not null default 0,
  status           text not null default 'not_started'
                   check (status in ('not_started','in_progress','submitted','done','on_hold')),
  progress         integer not null default 0 check (progress between 0 and 100),
  deliverable      text,                                -- concrete output expected
  criteria         text,                                -- how it will be judged
  submit_where     text,                                -- e.g. "WPS folder 03_Raw_Data"
  completed_at     date,                                -- when the owner handed it in
  approved_at      timestamptz,
  approved_by      uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists tasks_project_idx on public.tasks(project_id);
create index if not exists tasks_assignee_idx on public.tasks(assignee_id);

-- Private notes of the lead about a task (members never see these).
create table if not exists public.lead_notes (
  task_id    uuid primary key references public.tasks(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  note       text,
  updated_at timestamptz not null default now()
);

-- Every change of status / progress, with the note the person wrote.
-- This is the contribution log (evidence of who did what, when).
create table if not exists public.task_updates (
  id          bigint generated always as identity primary key,
  task_id     uuid not null references public.tasks(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  author_id   uuid references auth.users(id),
  member_id   uuid references public.project_members(id) on delete set null,
  old_status  text,
  new_status  text,
  old_progress integer,
  new_progress integer,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists task_updates_task_idx on public.task_updates(task_id);

-- Hand-ins. PRIVATE: only the person who submitted and the project lead can see them.
create table if not exists public.submissions (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  task_id       uuid references public.tasks(id) on delete set null,
  member_id     uuid not null references public.project_members(id) on delete cascade,
  author_id     uuid not null references auth.users(id),
  link          text,                                   -- WPS / Drive link of the file
  note          text,
  review_status text not null default 'pending'
                check (review_status in ('pending','accepted','revise')),
  review_note   text,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists submissions_project_idx on public.submissions(project_id);

-- Shared folders/files, tiered by sensitivity. Members see collaborative ones,
-- plus anything explicitly granted to them.
create table if not exists public.resources (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  folder      text,                                     -- 01_Administration ...
  title       text not null,
  url         text,
  tier        text not null default 'controlled'
              check (tier in ('restricted','controlled','collaborative')),
  note        text,
  created_at  timestamptz not null default now()
);
create table if not exists public.resource_access (
  resource_id uuid not null references public.resources(id) on delete cascade,
  member_id   uuid not null references public.project_members(id) on delete cascade,
  primary key (resource_id, member_id)
);

-- CRediT contribution record (lead fills it; each member sees their own rows).
create table if not exists public.credit_roles (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  member_id   uuid not null references public.project_members(id) on delete cascade,
  role        text not null,                            -- Conceptualization, ...
  degree      text not null default 'supporting'
              check (degree in ('lead','equal','supporting')),
  note        text,
  unique (project_id, member_id, role)
);

-- ---------------------------------------------------------------------
-- 2. Helper functions (security definer: they bypass RLS to avoid recursion)
-- ---------------------------------------------------------------------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

create or replace function public.is_lead(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from project_members
    where project_id = p_project and user_id = auth.uid() and role = 'lead' and active);
$$;

create or replace function public.is_member(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from project_members
    where project_id = p_project and user_id = auth.uid() and active);
$$;

create or replace function public.my_member_id(p_project uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from project_members
  where project_id = p_project and user_id = auth.uid() and active limit 1;
$$;

create or replace function public.can_see_task(p_task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tasks t join projects p on p.id = t.project_id
    where t.id = p_task and (
      public.is_lead(t.project_id)
      or (public.is_member(t.project_id) and
          (p.task_visibility = 'all' or t.assignee_id = public.my_member_id(t.project_id)))));
$$;

create or replace function public.can_see_resource(p_resource uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from resources r where r.id = p_resource and (
      public.is_lead(r.project_id)
      or (public.is_member(r.project_id) and (
            r.tier = 'collaborative'
            or exists (select 1 from resource_access ra
                       where ra.resource_id = r.id
                         and ra.member_id = public.my_member_id(r.project_id))))));
$$;

create or replace function public.resource_project(p_resource uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select project_id from resources where id = p_resource;
$$;

-- ---------------------------------------------------------------------
-- 3. Triggers
-- ---------------------------------------------------------------------

-- New account -> profile row, and link to any member slot reserved for that email.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name, is_admin)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          exists (select 1 from admin_emails a where a.email = lower(new.email)))
  on conflict (id) do nothing;

  update project_members pm set user_id = new.id
  from member_emails me
  where me.member_id = pm.id and lower(me.email) = lower(new.email) and pm.user_id is null;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- When a lead types an email for someone who already has an account, link now.
create or replace function public.link_member_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update project_members pm set user_id = p.id
  from profiles p
  where pm.id = new.member_id and lower(p.email) = lower(new.email)
    and (pm.user_id is null or pm.user_id <> p.id);
  return new;
end $$;

drop trigger if exists on_member_email on public.member_emails;
create trigger on_member_email after insert or update on public.member_emails
  for each row execute function public.link_member_email();

-- Keep is_admin out of reach of normal users.
create or replace function public.protect_profile() returns trigger
language plpgsql as $$
begin
  -- SQL editor / service role runs as postgres: allowed. App users: admin only.
  if new.is_admin is distinct from old.is_admin
     and current_user in ('authenticated','anon') and not public.is_admin() then
    raise exception 'only an admin can change admin rights';
  end if;
  new.email := old.email;
  return new;
end $$;

drop trigger if exists protect_profile on public.profiles;
create trigger protect_profile before update on public.profiles
  for each row execute function public.protect_profile();

-- Tasks: bookkeeping + automatic contribution log on every status/progress change.
create or replace function public.task_before_update() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'done' then
    new.progress := 100;
    if old.status <> 'done' then
      new.approved_at := now();
      new.approved_by := auth.uid();
    end if;
    if new.completed_at is null then new.completed_at := current_date; end if;
  elsif new.status = 'submitted' then
    if new.completed_at is null then new.completed_at := current_date; end if;
  else
    new.approved_at := null; new.approved_by := null;
    if old.status in ('submitted','done') and new.status not in ('submitted','done') then
      new.completed_at := null;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists task_before_update on public.tasks;
create trigger task_before_update before update on public.tasks
  for each row execute function public.task_before_update();

create or replace function public.task_after_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_note text := nullif(current_setting('app.update_note', true), '');
begin
  if new.status is distinct from old.status or new.progress is distinct from old.progress
     or v_note is not null then
    insert into task_updates(task_id, project_id, author_id, member_id,
                             old_status, new_status, old_progress, new_progress, note)
    values (new.id, new.project_id, auth.uid(), public.my_member_id(new.project_id),
            old.status, new.status, old.progress, new.progress, v_note);
  end if;
  return new;
end $$;

drop trigger if exists task_after_update on public.tasks;
create trigger task_after_update after update on public.tasks
  for each row execute function public.task_after_update();

-- Submissions: members cannot review their own hand-ins.
create or replace function public.protect_submission() returns trigger
language plpgsql as $$
begin
  if not public.is_lead(old.project_id) then
    if new.review_status is distinct from old.review_status
       or new.review_note is distinct from old.review_note then
      raise exception 'only the project lead can review submissions';
    end if;
    if old.review_status <> 'pending' then
      raise exception 'this submission has already been reviewed';
    end if;
  else
    if new.review_status is distinct from old.review_status then
      new.reviewed_at := now();
    end if;
  end if;
  new.author_id := old.author_id; new.member_id := old.member_id; new.project_id := old.project_id;
  return new;
end $$;

drop trigger if exists protect_submission on public.submissions;
create trigger protect_submission before update on public.submissions
  for each row execute function public.protect_submission();

-- ---------------------------------------------------------------------
-- 4. RPCs used by members (they cannot UPDATE tasks directly)
-- ---------------------------------------------------------------------

-- A member reports progress on a task assigned to them.
create or replace function public.report_progress(
  p_task uuid, p_status text, p_progress integer, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare t tasks%rowtype;
begin
  select * into t from tasks where id = p_task;
  if not found then raise exception 'task not found'; end if;

  if not public.is_lead(t.project_id) then
    if t.assignee_id is null or t.assignee_id <> public.my_member_id(t.project_id) then
      raise exception 'you can only update tasks assigned to you';
    end if;
    if p_status = 'done' then
      raise exception 'mark it "submitted"; the lead confirms "done"';
    end if;
    if t.status = 'done' then
      raise exception 'this task is already confirmed done';
    end if;
  end if;
  if p_status not in ('not_started','in_progress','submitted','done','on_hold') then
    raise exception 'bad status %', p_status;
  end if;

  perform set_config('app.update_note', coalesce(p_note, ''), true);
  update tasks set status = p_status,
                   progress = greatest(0, least(100, coalesce(p_progress, progress)))
  where id = p_task;
  perform set_config('app.update_note', '', true);
end $$;

-- Lead links a member slot to an email (creates/updates member_emails).
create or replace function public.set_member_email(p_member uuid, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_project uuid;
begin
  select project_id into v_project from project_members where id = p_member;
  if not public.is_lead(v_project) then raise exception 'lead only'; end if;
  if coalesce(trim(p_email), '') = '' then
    delete from member_emails where member_id = p_member;
    update project_members set user_id = null where id = p_member;
  else
    insert into member_emails(member_id, email) values (p_member, lower(trim(p_email)))
    on conflict (member_id) do update set email = excluded.email;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 5. Row-level security
-- ---------------------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.projects        enable row level security;
alter table public.project_members enable row level security;
alter table public.member_emails   enable row level security;
alter table public.tasks           enable row level security;
alter table public.task_updates    enable row level security;
alter table public.submissions     enable row level security;
alter table public.resources       enable row level security;
alter table public.resource_access enable row level security;
alter table public.credit_roles    enable row level security;
alter table public.lead_notes      enable row level security;
alter table public.admin_emails    enable row level security;   -- no policies: API cannot read it

-- profiles
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select
  using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles update self" on public.profiles;
create policy "profiles update self" on public.profiles for update
  using (id = auth.uid() or public.is_admin());

-- projects
drop policy if exists "projects read" on public.projects;
create policy "projects read" on public.projects for select
  using (public.is_member(id));
drop policy if exists "projects insert" on public.projects;
create policy "projects insert" on public.projects for insert
  with check (public.is_admin());
drop policy if exists "projects update" on public.projects;
create policy "projects update" on public.projects for update
  using (public.is_lead(id));
drop policy if exists "projects delete" on public.projects;
create policy "projects delete" on public.projects for delete
  using (public.is_admin());

-- project_members: every member sees the roster (names, codes, roles), leads edit it
drop policy if exists "members read" on public.project_members;
create policy "members read" on public.project_members for select
  using (public.is_member(project_id));
drop policy if exists "members write" on public.project_members;
create policy "members write" on public.project_members for all
  using (public.is_lead(project_id)) with check (public.is_lead(project_id));

-- member_emails: lead only (and you can see your own)
drop policy if exists "emails read" on public.member_emails;
create policy "emails read" on public.member_emails for select
  using (public.is_lead((select project_id from public.project_members where id = member_id))
         or member_id in (select id from public.project_members where user_id = auth.uid()));

-- tasks
drop policy if exists "tasks read" on public.tasks;
create policy "tasks read" on public.tasks for select
  using (public.can_see_task(id));
drop policy if exists "tasks lead write" on public.tasks;
create policy "tasks lead write" on public.tasks for all
  using (public.is_lead(project_id)) with check (public.is_lead(project_id));

-- task_updates: lead sees all; member sees the log of tasks assigned to them
drop policy if exists "updates read" on public.task_updates;
create policy "updates read" on public.task_updates for select
  using (public.is_lead(project_id)
         or author_id = auth.uid()
         or exists (select 1 from public.tasks t where t.id = task_id
                    and t.assignee_id = public.my_member_id(t.project_id)));

-- submissions: PRIVATE between the submitter and the lead
drop policy if exists "subs read" on public.submissions;
create policy "subs read" on public.submissions for select
  using (author_id = auth.uid() or public.is_lead(project_id));
drop policy if exists "subs insert" on public.submissions;
create policy "subs insert" on public.submissions for insert
  with check (author_id = auth.uid()
              and member_id = public.my_member_id(project_id)
              and (task_id is null or exists (
                    select 1 from public.tasks t where t.id = task_id and t.project_id = submissions.project_id)));
drop policy if exists "subs update" on public.submissions;
create policy "subs update" on public.submissions for update
  using (author_id = auth.uid() or public.is_lead(project_id));
drop policy if exists "subs delete" on public.submissions;
create policy "subs delete" on public.submissions for delete
  using (public.is_lead(project_id) or (author_id = auth.uid() and review_status = 'pending'));

-- resources: least privilege
drop view if exists public.tasks_v;
drop policy if exists "res read" on public.resources;
create policy "res read" on public.resources for select
  using (public.can_see_resource(id));
drop policy if exists "res write" on public.resources;
create policy "res write" on public.resources for all
  using (public.is_lead(project_id)) with check (public.is_lead(project_id));

drop policy if exists "resacc read" on public.resource_access;
create policy "resacc read" on public.resource_access for select
  using (public.is_lead(public.resource_project(resource_id))
         or member_id in (select id from public.project_members where user_id = auth.uid()));
drop policy if exists "resacc write" on public.resource_access;
create policy "resacc write" on public.resource_access for all
  using (public.is_lead(public.resource_project(resource_id)))
  with check (public.is_lead(public.resource_project(resource_id)));

-- credit_roles
drop policy if exists "credit read" on public.credit_roles;
create policy "credit read" on public.credit_roles for select
  using (public.is_lead(project_id) or member_id = public.my_member_id(project_id));
drop policy if exists "credit write" on public.credit_roles;
create policy "credit write" on public.credit_roles for all
  using (public.is_lead(project_id)) with check (public.is_lead(project_id));

-- lead_notes: lead only
drop policy if exists "lead notes" on public.lead_notes;
create policy "lead notes" on public.lead_notes for all
  using (public.is_lead(project_id)) with check (public.is_lead(project_id));

-- Grants (Supabase gives these by default; repeated here for clarity).
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.report_progress(uuid, text, integer, text) to authenticated;
grant execute on function public.set_member_email(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Make yourself admin, either before signing up:
--    insert into public.admin_emails values ('you@example.com');
--    or after signing up once in the app:
--    update public.profiles set is_admin = true where email = 'you@example.com';
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 7. Hardening (Supabase security advisor)
-- ---------------------------------------------------------------------
alter function public.protect_submission() set search_path = public;
alter function public.protect_profile() set search_path = public;
alter function public.task_before_update() set search_path = public;

-- Nobody signed-out may call any of these.
revoke execute on function public.is_admin(), public.is_lead(uuid), public.is_member(uuid), public.my_member_id(uuid),
  public.can_see_task(uuid), public.can_see_resource(uuid), public.resource_project(uuid),
  public.report_progress(uuid, text, integer, text), public.set_member_email(uuid, text),
  public.handle_new_user(), public.link_member_email(), public.task_after_update(),
  public.protect_submission(), public.protect_profile(), public.task_before_update()
  from public, anon;
-- Trigger functions are never called directly.
revoke execute on function public.handle_new_user(), public.link_member_email(), public.task_after_update(),
  public.protect_submission(), public.protect_profile(), public.task_before_update()
  from authenticated;
-- Signed-in users need the RLS helpers (they only answer about the caller) and the two RPCs.
grant execute on function public.is_admin(), public.is_lead(uuid), public.is_member(uuid), public.my_member_id(uuid),
  public.can_see_task(uuid), public.can_see_resource(uuid), public.resource_project(uuid),
  public.report_progress(uuid, text, integer, text), public.set_member_email(uuid, text)
  to authenticated;
