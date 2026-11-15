-- morethere — your own order for discoveries (drag and drop)
--
-- items.position: smaller comes first. New discoveries go on top
-- (minus the creation time in milliseconds); moving one sets it halfway
-- between its new neighbours. Only the owner can change it (items_update policy).
-- Shared spaces keep their own order (by when things were added).

alter table public.items add column if not exists position double precision;

update public.items
  set position = -extract(epoch from created_at) * 1000
  where position is null;

create or replace function private.item_default_position()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.position := coalesce(new.position, -extract(epoch from coalesce(new.created_at, now())) * 1000);
  return new;
end;
$$;
-- (A trigger function cannot be called directly, so no execute grant to manage.)

create or replace trigger items_default_position before insert or update on public.items
  for each row execute function private.item_default_position();

create index if not exists items_owner_position on public.items (owner_id, position);

notify pgrst, 'reload schema';
