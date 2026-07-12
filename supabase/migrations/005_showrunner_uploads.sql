-- Showrunner 005 — let signed-in users upload their own reference images
-- (e.g. from Midjourney) into the 'showrunner' bucket from the browser.
-- Reads are already public (bucket is public); this adds insert/update.
-- Run in the Supabase SQL editor.

drop policy if exists "sr auth upload" on storage.objects;
create policy "sr auth upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'showrunner');

drop policy if exists "sr auth update" on storage.objects;
create policy "sr auth update" on storage.objects
  for update to authenticated using (bucket_id = 'showrunner') with check (bucket_id = 'showrunner');
