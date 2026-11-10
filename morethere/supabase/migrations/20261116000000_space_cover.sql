-- morethere — cover photo for a shared space
--
-- Any active member can set or remove the cover. The file must be one the
-- member uploaded to their own folder of the private "media" bucket. It is
-- readable by the space's members and invitees only.

alter table public.worlds add column if not exists cover_path text;
alter table public.worlds add constraint worlds_cover_path_format
  check (cover_path is null or cover_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$');

create or replace function public.set_world_cover(p_world uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_world_member(p_world) then raise exception 'world_not_found'; end if;
  if p_path is not null then
    if split_part(p_path, '/', 1) <> auth.uid()::text then raise exception 'not_your_file'; end if;
    if not exists (select 1 from storage.objects where bucket_id = 'media' and name = p_path) then
      raise exception 'file_not_found';
    end if;
  end if;
  update public.worlds set cover_path = p_path where id = p_world;
end;
$$;
revoke execute on function public.set_world_cover(uuid, text) from public, anon;
grant execute on function public.set_world_cover(uuid, text) to authenticated;

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
      select 1 from public.worlds w
      where w.cover_path = p_path and private.is_world_invitee(w.id)
    )
    or exists (
      select 1 from public.profiles p
      where p.avatar_path = p_path and private.can_see_profile(p.id)
    );
$$;

notify pgrst, 'reload schema';
