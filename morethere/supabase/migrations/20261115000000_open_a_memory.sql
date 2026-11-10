-- morethere — More for you: open a single memory to a friend
--
-- A "thought" is now a revocable permission on one item of the owner's
-- collection, not a copy. The recipient reads the live item (edits and photo
-- included) for as long as the thought exists, the item exists and the two
-- are connected. The owner revokes by deleting the thought. The snapshot
-- columns are kept for history and export.

alter table public.thoughts add column if not exists allow_save boolean not null default false;
-- Thoughts sent before this change could always be saved: keep that.
update public.thoughts set allow_save = true where created_at < now();

create or replace function private.has_item_grant(p_item uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.thoughts t
    join public.items i on i.id = t.source_item_id
    where t.source_item_id = p_item
      and t.recipient_id = auth.uid()
      and t.sender_id = i.owner_id
      and private.are_connected(t.sender_id, t.recipient_id)
  );
$$;
revoke execute on function private.has_item_grant(uuid) from public, anon;
grant execute on function private.has_item_grant(uuid) to authenticated;

alter policy items_select on public.items
  using (owner_id = (select auth.uid()) or private.can_view_item(owner_id, collection_id) or private.has_item_grant(id));

create or replace function private.can_view_media(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.items i
      where i.image_path = p_path
        and (private.can_view_item(i.owner_id, i.collection_id) or private.has_item_grant(i.id))
    )
    or exists (
      select 1 from public.thoughts t
      where t.item_image_path = p_path and t.recipient_id = auth.uid()
        and private.are_connected(t.sender_id, t.recipient_id)
    )
    or exists (
      select 1 from public.world_items wi
      where wi.image_path = p_path and private.is_world_member(wi.world_id)
    )
    or exists (
      select 1 from public.profiles p
      where p.avatar_path = p_path and private.can_see_profile(p.id)
    );
$$;

-- Open one of my memories to a connection.
create or replace function public.open_item_to(
  p_recipient uuid,
  p_item uuid,
  p_message text default '',
  p_allow_save boolean default false,
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
                               item_category, item_image_path, item_memory_date, source_item_id,
                               allow_ai_export, allow_save)
    values (v_me, p_recipient, left(coalesce(p_message, ''), 1000), v_item.title, v_item.url,
            v_item.note, v_item.category, v_item.image_path, v_item.memory_date, v_item.id,
            coalesce(p_allow_ai_export, false), coalesce(p_allow_save, false))
    returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.open_item_to(uuid, uuid, text, boolean, boolean) from public, anon;
grant execute on function public.open_item_to(uuid, uuid, text, boolean, boolean) to authenticated;

-- Keeping a copy needs the owner's permission; the copy is of the live item.
create or replace function public.save_thought(p_thought uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.thoughts;
  v_i public.items;
  v_new uuid;
begin
  select * into v_t from public.thoughts where id = p_thought and recipient_id = auth.uid();
  if not found then raise exception 'thought_not_found'; end if;
  if not v_t.allow_save then raise exception 'save_not_permitted'; end if;
  select * into v_i from public.items where id = v_t.source_item_id;
  if found then
    insert into public.items (owner_id, title, url, note, category, memory_date)
      values (auth.uid(), v_i.title, v_i.url, v_i.note, v_i.category, v_i.memory_date)
      returning id into v_new;
  else
    insert into public.items (owner_id, title, url, note, category, memory_date)
      values (auth.uid(), v_t.item_title, v_t.item_url, v_t.item_note, v_t.item_category, v_t.item_memory_date)
      returning id into v_new;
  end if;
  update public.thoughts set read_at = coalesce(read_at, now()) where id = p_thought;
  return v_new;
end;
$$;

-- AI export of opened memories reads the live item.
create or replace function public.ai_export_thoughts()
returns table (title text, url text, note text, category text, collection text, added_by_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(i.title, t.item_title), coalesce(i.url, t.item_url),
         case when t.message <> '' then coalesce(i.note, t.item_note) || E'\nDedication: ' || t.message else coalesce(i.note, t.item_note) end,
         coalesce(i.category, t.item_category), 'More for you', p.display_name
  from public.thoughts t
  join public.profiles p on p.id = t.sender_id
  left join public.items i on i.id = t.source_item_id
  where t.recipient_id = auth.uid() and t.allow_ai_export
    and private.are_connected(t.sender_id, t.recipient_id)
  order by t.created_at desc;
$$;

notify pgrst, 'reload schema';
