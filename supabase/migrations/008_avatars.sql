-- 008_avatars.sql
-- Profile pictures: profiles.avatar_url plus a Supabase Storage bucket.
--
-- The bucket is public-read so the navbar can show the image with a plain
-- URL (no signed-URL refresh on every page). What keeps it private enough:
--   - files live at avatars/{user_id}/{random uuid}.{ext}; the random name is
--     not guessable, and nobody but the owner may list a folder;
--   - the app re-encodes the image in the browser before upload, which also
--     strips EXIF metadata (an iPhone photo can carry GPS coordinates);
--   - only the owner can add or delete files in their folder.

alter table public.profiles
  add column avatar_url text;

comment on column public.profiles.avatar_url is
  'Public URL of the profile picture in the avatars bucket, or null for initials.';

-- ===========================================================================
-- Storage bucket
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Path check: the first folder must be the caller's own user id.
create policy "Users upload own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Needed by remove() (Storage reads the row before deleting it). Own folder
-- only; public reads go through the public URL, not this policy.
create policy "Users read own avatar folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users delete own avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
