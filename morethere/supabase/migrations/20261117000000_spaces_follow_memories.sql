-- morethere — discoveries in a shared space follow the original memory
--
-- When the owner edits a memory (title, link, note, category, photo, date),
-- the copies *they* added to shared spaces update too. Contributions made by
-- other people are never touched. Existing copies are refreshed once.

create or replace function private.sync_world_items_from_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.title, new.url, new.note, new.category, new.image_path, new.memory_date)
     is distinct from (old.title, old.url, old.note, old.category, old.image_path, old.memory_date) then
    update public.world_items wi
      set title = new.title, url = new.url, note = new.note, category = new.category,
          image_path = new.image_path, memory_date = new.memory_date
      where wi.source_item_id = new.id and wi.added_by = new.owner_id;
  end if;
  return new;
end;
$$;
revoke execute on function private.sync_world_items_from_item() from public, anon, authenticated;

drop trigger if exists items_sync_world_items on public.items;
create trigger items_sync_world_items after update on public.items
  for each row execute function private.sync_world_items_from_item();

-- Refresh copies made before this change.
update public.world_items wi
  set title = i.title, url = i.url, note = i.note, category = i.category,
      image_path = i.image_path, memory_date = i.memory_date
  from public.items i
  where wi.source_item_id = i.id and wi.added_by = i.owner_id
    and (wi.title, wi.url, wi.note, wi.category, wi.image_path, wi.memory_date)
        is distinct from (i.title, i.url, i.note, i.category, i.image_path, i.memory_date);

notify pgrst, 'reload schema';
