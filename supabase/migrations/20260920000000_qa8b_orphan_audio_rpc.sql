-- QA8B: bound orphaned Quick Read audio cleanup to aged, unreferenced objects.

create or replace function public.list_orphaned_quick_read_objects()
returns table(object_path text)
language sql
security definer
set search_path = public, storage
as $$
  select objects.name
  from storage.objects as objects
  where objects.bucket_id = 'quick-read-audio'
    and objects.name ~* '^quick-read/[0-9a-f-]{36}/[0-9a-f-]{36}/source\.(m4a|mp4|webm|wav|ogg)$'
    and objects.owner_id is not null
    and objects.owner_id::text = (storage.foldername(objects.name))[2]
    and objects.created_at <= now() - interval '24 hours'
    and not exists (
      select 1
      from public.analysis_runs
      where analysis_runs.audio_object_path = objects.name
    )
    and not exists (
      select 1
      from public.attempts
      where attempts.id::text = (storage.foldername(objects.name))[3]
    )
  order by objects.created_at, objects.name
  limit 50;
$$;

revoke all on function public.list_orphaned_quick_read_objects() from anon, public, authenticated;
grant execute on function public.list_orphaned_quick_read_objects() to service_role;
