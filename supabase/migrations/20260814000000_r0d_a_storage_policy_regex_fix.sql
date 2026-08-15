-- UP

-- The foundation migration used an over-escaped dot in the object-name
-- regular expression. Recreate the policies with a literal extension
-- separator so valid source.wav/source.m4a paths are accepted.

drop policy if exists quick_read_audio_insert on storage.objects;
create policy quick_read_audio_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'quick-read-audio'
  and owner_id = (select auth.uid()::text)
  and name ~* '^quick-read/[0-9a-f-]{36}/[0-9a-f-]{36}/source\.(m4a|mp4|webm|wav|ogg)$'
  and (storage.foldername(name))[2] = (select auth.uid()::text)
  and exists (
    select 1
    from public.attempts
    where id::text = (storage.foldername(name))[3]
      and owner_id = (select auth.uid())
  )
);

drop policy if exists quick_read_audio_select on storage.objects;
create policy quick_read_audio_select on storage.objects
for select to authenticated
using (
  bucket_id = 'quick-read-audio'
  and owner_id = (select auth.uid()::text)
  and name ~* '^quick-read/[0-9a-f-]{36}/[0-9a-f-]{36}/source\.(m4a|mp4|webm|wav|ogg)$'
  and (storage.foldername(name))[2] = (select auth.uid()::text)
  and exists (
    select 1
    from public.attempts
    where id::text = (storage.foldername(name))[3]
      and owner_id = (select auth.uid())
  )
);

drop policy if exists quick_read_audio_delete on storage.objects;
create policy quick_read_audio_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'quick-read-audio'
  and owner_id = (select auth.uid()::text)
  and name ~* '^quick-read/[0-9a-f-]{36}/[0-9a-f-]{36}/source\.(m4a|mp4|webm|wav|ogg)$'
  and (storage.foldername(name))[2] = (select auth.uid()::text)
  and exists (
    select 1
    from public.attempts
    where id::text = (storage.foldername(name))[3]
      and owner_id = (select auth.uid())
  )
);

-- DOWN
-- drop policy if exists quick_read_audio_insert on storage.objects;
-- drop policy if exists quick_read_audio_select on storage.objects;
-- drop policy if exists quick_read_audio_delete on storage.objects;
