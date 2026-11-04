-- morethere — photos and performance
--
-- * Photos live in a private Storage bucket, one folder per user ("<uid>/<uuid>.jpg").
--   A photo is readable by its owner and by anyone who may see a row that
--   references it (a shared item, a thought received, a world item) — the same
--   rules as the content itself. A row may only reference a file in its own
--   author's folder, so no one can grant themselves access to someone else's file.
-- * Policies re-evaluate auth.uid() once per query instead of once per row.
-- * Covering indexes for foreign keys.

-- ---------------------------------------------------------------------------
-- Photo columns
-- ---------------------------------------------------------------------------

alter table public.items add column image_path text;
alter table public.items add constraint items_image_path_owner check (
  image_path is null
  or (image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$' and split_part(image_path, '/', 1) = owner_id::text)
);
create index items_image_path on public.items (image_path) where image_path is not null;

alter table public.thoughts add column item_image_path text;
alter table public.thoughts add constraint thoughts_image_path_sender check (
  item_image_path is null
  or (item_image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$' and split_part(item_image_path, '/', 1) = sender_id::text)
);
create index thoughts_image_path on public.thoughts (item_image_path) where item_image_path is not null;

alter table public.world_items add column image_path text;
alter table public.world_items add constraint world_items_image_path_author check (
  image_path is null
  or (image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$' and split_part(image_path, '/', 1) = added_by::text)
);
create index world_items_image_path on public.world_items (image_path) where image_path is not null;

-- ---------------------------------------------------------------------------
-- Private bucket and its policies
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.can_view_media(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.items i
      where i.image_path = p_path and private.can_view_item(i.owner_id, i.collection_id)
    )
    or exists (
      select 1 from public.thoughts t
      where t.item_image_path = p_path and t.recipient_id = auth.uid()
    )
    or exists (
      select 1 from public.world_items wi
      where wi.image_path = p_path and private.is_world_member(wi.world_id)
    );
$$;
revoke execute on function private.can_view_media(text) from public, anon;
grant execute on function private.can_view_media(text) to authenticated;

create policy media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy media_select on storage.objects for select to authenticated
  using (
    bucket_id = 'media'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or private.can_view_media(name))
  );
create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Snapshots carry the photo along
-- ---------------------------------------------------------------------------

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
                               item_category, item_image_path, source_item_id, allow_ai_export)
    values (v_me, p_recipient, left(coalesce(p_message, ''), 1000), v_item.title, v_item.url,
            v_item.note, v_item.category, v_item.image_path, v_item.id, coalesce(p_allow_ai_export, false))
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
  insert into public.world_items (world_id, added_by, title, url, note, category, image_path, source_item_id)
    values (p_world, auth.uid(), v_item.title, v_item.url, v_item.note, v_item.category, v_item.image_path, v_item.id)
  on conflict (world_id, source_item_id) where source_item_id is not null do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Performance: covering indexes for foreign keys
-- ---------------------------------------------------------------------------

create index if not exists connections_requester on public.connections (requester_id);
create index if not exists invitations_accepted_by on public.invitations (accepted_by) where accepted_by is not null;
create index if not exists items_collection_owner on public.items (collection_id, owner_id) where collection_id is not null;
create index if not exists thoughts_source_item on public.thoughts (source_item_id) where source_item_id is not null;
create index if not exists world_items_added_by on public.world_items (added_by);
create index if not exists world_items_source_item on public.world_items (source_item_id) where source_item_id is not null;
create index if not exists world_members_invited_by on public.world_members (invited_by) where invited_by is not null;
create index if not exists wsc_collection_owner on public.world_share_collections (collection_id, owner_id);
create index if not exists wsc_share_owner on public.world_share_collections (share_id, owner_id);
create index if not exists worlds_owner on public.worlds (owner_id);
drop index if exists public.items_collection;

-- ---------------------------------------------------------------------------
-- Performance: evaluate auth.uid() once per statement in every policy
-- ---------------------------------------------------------------------------

alter policy profiles_select on public.profiles
  using (private.can_see_profile(id));

alter policy profiles_update on public.profiles
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

alter policy collections_select on public.collections
  using (owner_id = (select auth.uid()) or private.can_view_collection(owner_id, id));

alter policy collections_insert on public.collections
  with check (owner_id = (select auth.uid()));

alter policy collections_update on public.collections
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

alter policy collections_delete on public.collections
  using (owner_id = (select auth.uid()));

alter policy items_select on public.items
  using (owner_id = (select auth.uid()) or private.can_view_item(owner_id, collection_id));

alter policy items_insert on public.items
  with check (owner_id = (select auth.uid()));

alter policy items_update on public.items
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

alter policy items_delete on public.items
  using (owner_id = (select auth.uid()));

alter policy connections_select on public.connections
  using ((select auth.uid()) in (requester_id, addressee_id));

alter policy invitations_select on public.invitations
  using (inviter_id = (select auth.uid()));

alter policy world_shares_select on public.world_shares
  using (owner_id = (select auth.uid()) or (grantee_id = (select auth.uid()) and private.are_connected(owner_id, grantee_id)));

alter policy world_shares_insert on public.world_shares
  with check (owner_id = (select auth.uid()) and private.are_connected(owner_id, grantee_id));

alter policy world_shares_update on public.world_shares
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and private.are_connected(owner_id, grantee_id));

alter policy world_shares_delete on public.world_shares
  using (owner_id = (select auth.uid()));

alter policy wsc_select on public.world_share_collections
  using (
    owner_id = (select auth.uid())
    or exists (select 1 from public.world_shares s where s.id = share_id and s.grantee_id = (select auth.uid())
               and private.are_connected(s.owner_id, s.grantee_id))
  );

alter policy wsc_insert on public.world_share_collections
  with check (owner_id = (select auth.uid()));

alter policy wsc_delete on public.world_share_collections
  using (owner_id = (select auth.uid()));

alter policy thoughts_select on public.thoughts
  using ((select auth.uid()) in (sender_id, recipient_id));

alter policy thoughts_delete on public.thoughts
  using (sender_id = (select auth.uid()));

alter policy worlds_select on public.worlds
  using (owner_id = (select auth.uid()) or private.is_world_invitee(id));

alter policy worlds_insert on public.worlds
  with check (owner_id = (select auth.uid()));

alter policy worlds_update on public.worlds
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

alter policy worlds_delete on public.worlds
  using (owner_id = (select auth.uid()));

alter policy world_members_select on public.world_members
  using (user_id = (select auth.uid()) or private.is_world_member(world_id));

alter policy world_members_delete on public.world_members
  using (
    (user_id = (select auth.uid()) and role <> 'owner')
    or (private.world_role(world_id) = 'owner' and role <> 'owner')
  );

alter policy world_items_select on public.world_items
  using (private.is_world_member(world_id));

alter policy world_items_insert on public.world_items
  with check (added_by = (select auth.uid()) and private.is_world_member(world_id));

alter policy world_items_delete on public.world_items
  using (added_by = (select auth.uid()) or private.world_role(world_id) = 'owner');

