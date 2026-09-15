-- Bild-Anhang für Ankündigungen ("Aktuelles"), z. B. ein Foto zur Ankündigung.
alter table announcements add column image_url text;

-- Storage-Bucket "announcement-images": öffentlich lesbar (Ankündigungen sind
-- für alle angemeldeten Mitarbeiter ohnehin sichtbar), Schreiben admin-
-- exklusiv — anders als bei "avatars" kein Ordner pro Person nötig, da nur
-- Admins Ankündigungen erstellen dürfen (announcements_write_admin, siehe
-- Migration 0004_announcements_and_profile.sql).
insert into storage.buckets (id, name, public)
values ('announcement-images', 'announcement-images', true)
on conflict (id) do nothing;

create policy "announcement_images_write_admin" on storage.objects for all
  to authenticated
  using (bucket_id = 'announcement-images' and is_admin())
  with check (bucket_id = 'announcement-images' and is_admin());
