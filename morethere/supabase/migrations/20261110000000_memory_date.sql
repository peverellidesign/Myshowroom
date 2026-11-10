-- morethere — the date of a memory
--
-- `memory_date` is when the moment happened (for a photo: when it was taken),
-- distinct from `created_at` (when it was saved). It travels with every
-- snapshot: thoughts, world items and saved copies.

alter table public.items add column if not exists memory_date date;
alter table public.items add constraint items_memory_date_range
  check (memory_date is null or memory_date between date '1800-01-01' and date '2200-12-31');
create index if not exists items_owner_memory_date on public.items (owner_id, memory_date desc) where memory_date is not null;

alter table public.thoughts add column if not exists item_memory_date date;
alter table public.world_items add column if not exists memory_date date;

create or replace function public.send_thought(
  p_recipient uuid,
  p_item uuid,
  p_message text,
  p_allow_ai_export boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_item public.items;
  v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if not private.are_connected(v_me, p_recipient) then raise exception 'not_connected'; end if;
  select * into v_item from public.items where id = p_item and owner_id = v_me;
  if not found then raise exception 'item_not_found'; end if;
  perform private.enforce_rate_limit('thought', 100, interval '1 day');

  insert into public.thoughts (sender_id, recipient_id, message, item_title, item_url, item_note,
                               item_category, item_image_path, item_memory_date, source_item_id, allow_ai_export)
    values (v_me, p_recipient, left(coalesce(p_message, ''), 1000), v_item.title, v_item.url,
            v_item.note, v_item.category, v_item.image_path, v_item.memory_date, v_item.id,
            coalesce(p_allow_ai_export, false))
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.add_item_to_world(p_world uuid, p_item uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.items;
  v_id uuid;
begin
  if not private.is_world_member(p_world) then raise exception 'world_not_found'; end if;
  select * into v_item from public.items where id = p_item and owner_id = auth.uid();
  if not found then raise exception 'item_not_found'; end if;
  insert into public.world_items (world_id, added_by, title, url, note, category, image_path, memory_date, source_item_id)
    values (p_world, auth.uid(), v_item.title, v_item.url, v_item.note, v_item.category, v_item.image_path,
            v_item.memory_date, v_item.id)
  on conflict (world_id, source_item_id) where source_item_id is not null do nothing
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.save_shared_item(p_item uuid, p_collection uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_src public.items;
  v_share public.world_shares;
  v_new uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select * into v_src from public.items where id = p_item;
  if not found or v_src.owner_id = v_me or not private.can_view_item(v_src.owner_id, v_src.collection_id) then
    raise exception 'item_not_found';
  end if;
  v_share := private.share_for(v_src.owner_id);
  if not coalesce(v_share.can_save, false) then raise exception 'save_not_permitted'; end if;
  if p_collection is not null and not exists (
    select 1 from public.collections where id = p_collection and owner_id = v_me
  ) then
    raise exception 'collection_not_found';
  end if;

  insert into public.items (owner_id, collection_id, title, url, note, category, memory_date)
    values (v_me, p_collection, v_src.title, v_src.url, v_src.note, v_src.category, v_src.memory_date)
    returning id into v_new;
  return v_new;
end;
$$;

create or replace function public.save_thought(p_thought uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.thoughts;
  v_new uuid;
begin
  select * into v_t from public.thoughts where id = p_thought and recipient_id = auth.uid();
  if not found then raise exception 'thought_not_found'; end if;
  insert into public.items (owner_id, title, url, note, category, memory_date)
    values (auth.uid(), v_t.item_title, v_t.item_url, v_t.item_note, v_t.item_category, v_t.item_memory_date)
    returning id into v_new;
  update public.thoughts set read_at = coalesce(read_at, now()) where id = p_thought;
  return v_new;
end;
$$;

notify pgrst, 'reload schema';
