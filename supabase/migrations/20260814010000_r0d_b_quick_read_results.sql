-- UP

-- Transcript content is private, short-lived, and never exposed through the
-- client-facing result contract.
create table if not exists public.analysis_transcripts (
  run_id uuid primary key references public.analysis_runs(id) on delete cascade,
  attempt_id uuid not null unique references public.attempts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  transcript text not null check (length(transcript) <= 200000),
  transcript_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Structured feedback is the only analysis payload readable by the client.
create table if not exists public.analysis_results (
  run_id uuid primary key references public.analysis_runs(id) on delete cascade,
  attempt_id uuid not null unique references public.attempts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  clarity numeric not null check (clarity >= 0 and clarity <= 1),
  structure numeric not null check (structure >= 0 and structure <= 1),
  specificity numeric not null check (specificity >= 0 and specificity <= 1),
  concision numeric not null check (concision >= 0 and concision <= 1),
  strength text not null check (length(strength) between 1 and 1200),
  improvement text not null check (length(improvement) between 1 and 1200),
  next_drill text not null check (length(next_drill) between 1 and 1200),
  word_count integer not null default 0 check (word_count >= 0),
  metric_schema_version text not null default 'r0d.1',
  analysis_version text not null default 'r0d-b.1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists analysis_transcripts_expiry_idx
  on public.analysis_transcripts (transcript_expires_at);

create index if not exists analysis_results_owner_idx
  on public.analysis_results (owner_id, created_at desc);

create or replace function public.assert_analysis_transcript_owner()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  attempt_owner uuid;
begin
  select owner_id into attempt_owner
  from public.attempts
  where id = new.attempt_id;

  if attempt_owner is null or new.owner_id <> attempt_owner then
    raise exception 'Analysis transcript owner does not match attempt owner' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.assert_analysis_result_owner()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  attempt_owner uuid;
begin
  select owner_id into attempt_owner
  from public.attempts
  where id = new.attempt_id;

  if attempt_owner is null or new.owner_id <> attempt_owner then
    raise exception 'Analysis result owner does not match attempt owner' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists analysis_transcripts_owner_guard on public.analysis_transcripts;
create trigger analysis_transcripts_owner_guard
before insert or update on public.analysis_transcripts
for each row execute function public.assert_analysis_transcript_owner();

drop trigger if exists analysis_results_owner_guard on public.analysis_results;
create trigger analysis_results_owner_guard
before insert or update on public.analysis_results
for each row execute function public.assert_analysis_result_owner();

drop trigger if exists analysis_transcripts_set_updated_at on public.analysis_transcripts;
create trigger analysis_transcripts_set_updated_at
before update on public.analysis_transcripts
for each row execute function public.set_updated_at();

drop trigger if exists analysis_results_set_updated_at on public.analysis_results;
create trigger analysis_results_set_updated_at
before update on public.analysis_results
for each row execute function public.set_updated_at();

alter table public.analysis_transcripts enable row level security;
alter table public.analysis_results enable row level security;

revoke all on public.analysis_transcripts, public.analysis_results from anon, public;
grant select on public.analysis_results to authenticated;

drop policy if exists analysis_results_owner_select on public.analysis_results;
create policy analysis_results_owner_select on public.analysis_results
for select to authenticated
using ((select auth.uid()) = owner_id);

-- Transcript content is intentionally service-role-only. The Edge Function
-- persists and expires it without exposing it through PostgREST.

-- DOWN
-- drop function if exists public.assert_analysis_result_owner();
-- drop function if exists public.assert_analysis_transcript_owner();
-- drop table if exists public.analysis_results;
-- drop table if exists public.analysis_transcripts;
