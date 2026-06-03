-- N16 v2 — multi-step candidate nurture/drip sequences.
-- A sequence is a named, ordered list of timed nurture emails. A candidate
-- (application) is ENROLLED (manually in Phase 1), and a cron sends each step
-- on schedule until the sequence finishes or an automatic exit fires
-- (candidate replied, stage moved off the enrolled stage, or an offer was
-- sent). Scale+ feature; the builder is gated owner/admin.

create table public.automation_sequences (
  id uuid primary key default gen_random_uuid(),
  dso_id uuid not null references public.dsos(id) on delete cascade,
  name text not null,
  is_enabled boolean not null default true,
  created_by_dso_user_id uuid references public.dso_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index automation_sequences_dso_idx on public.automation_sequences (dso_id);

create table public.automation_sequence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.automation_sequences(id) on delete cascade,
  step_order int not null,
  -- Days to wait before THIS step (from enrollment for step 1, otherwise
  -- from the previous step's send). 0 = send immediately.
  delay_days int not null default 0 check (delay_days >= 0 and delay_days <= 365),
  subject text not null,
  body text not null,
  created_at timestamptz not null default now(),
  unique (sequence_id, step_order)
);
create index automation_sequence_steps_seq_idx
  on public.automation_sequence_steps (sequence_id, step_order);

create table public.automation_sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.automation_sequences(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  dso_id uuid not null references public.dsos(id) on delete cascade,
  enrolled_by_dso_user_id uuid references public.dso_users(id) on delete set null,
  enrolled_at timestamptz not null default now(),
  -- The stage the application sat in at enrollment; if it later differs, the
  -- sequence auto-exits ('stage_changed').
  enrolled_stage_id uuid,
  status text not null default 'active' check (status in ('active', 'completed', 'exited')),
  -- Number of steps already sent.
  current_step int not null default 0,
  next_send_at timestamptz,
  last_sent_at timestamptz,
  exit_reason text,
  exited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- At most one ACTIVE enrollment per application (no double-dripping).
create unique index automation_sequence_enroll_one_active
  on public.automation_sequence_enrollments (application_id)
  where status = 'active';
create index automation_sequence_enroll_due_idx
  on public.automation_sequence_enrollments (status, next_send_at);
create index automation_sequence_enroll_app_idx
  on public.automation_sequence_enrollments (application_id);

create table public.automation_sequence_sends (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.automation_sequence_enrollments(id) on delete cascade,
  step_id uuid not null references public.automation_sequence_steps(id) on delete cascade,
  sent_at timestamptz not null default now(),
  unique (enrollment_id, step_id)
);

-- ── RLS ──
alter table public.automation_sequences enable row level security;
alter table public.automation_sequence_steps enable row level security;
alter table public.automation_sequence_enrollments enable row level security;
alter table public.automation_sequence_sends enable row level security;

create policy "automation_sequences: dso read"
  on public.automation_sequences for select to authenticated
  using (dso_id = public.current_dso_id());
create policy "automation_sequences: admin write"
  on public.automation_sequences for all to authenticated
  using (dso_id = public.current_dso_id() and public.current_dso_user_role() in ('owner','admin'))
  with check (dso_id = public.current_dso_id() and public.current_dso_user_role() in ('owner','admin'));

create policy "automation_sequence_steps: dso read"
  on public.automation_sequence_steps for select to authenticated
  using (exists (select 1 from public.automation_sequences s
    where s.id = sequence_id and s.dso_id = public.current_dso_id()));
create policy "automation_sequence_steps: admin write"
  on public.automation_sequence_steps for all to authenticated
  using (exists (select 1 from public.automation_sequences s
    where s.id = sequence_id and s.dso_id = public.current_dso_id()
      and public.current_dso_user_role() in ('owner','admin')))
  with check (exists (select 1 from public.automation_sequences s
    where s.id = sequence_id and s.dso_id = public.current_dso_id()
      and public.current_dso_user_role() in ('owner','admin')));

create policy "automation_sequence_enrollments: dso read"
  on public.automation_sequence_enrollments for select to authenticated
  using (dso_id = public.current_dso_id());

create policy "automation_sequence_sends: dso read"
  on public.automation_sequence_sends for select to authenticated
  using (exists (
    select 1 from public.automation_sequence_enrollments e
    where e.id = enrollment_id and e.dso_id = public.current_dso_id()));
