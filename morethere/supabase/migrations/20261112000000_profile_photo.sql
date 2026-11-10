-- morethere — profile photo
--
-- The photo lives in the private "media" bucket, in the person's own folder.
-- It is readable exactly by those who may see the profile: the person,
-- their connections (and pending requests), and people they share a space with.

alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add constraint profiles_avatar_path_owner check (
  avatar_path is null
  or (avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$' and split_part(avatar_path, '/', 1) = id::text)
);
create index if not exists profiles_avatar_path on public.profiles (avatar_path) where avatar_path is not null;

grant update (avatar_path) on public.profiles to authenticated;

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
    )
    or exists (
      select 1 from public.profiles p
      where p.avatar_path = p_path and private.can_see_profile(p.id)
    );
$$;

notify pgrst, 'reload schema';
