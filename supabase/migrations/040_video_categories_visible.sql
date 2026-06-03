-- Video categories: visible to all authenticated users; tier gates content in the app + videos RLS.

drop policy if exists "video_categories_select" on public.video_categories;
create policy "video_categories_select"
  on public.video_categories for select to authenticated
  using (true);
