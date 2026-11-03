-- morethere — core schema
--
-- Principles
--   * Every archive is private by default. Rows are readable only by their owner
--     unless an explicit, revocable grant exists.
--   * Authorization is enforced in Postgres (RLS + SECURITY DEFINER functions),
--     never in the client.
--   * Social writes that need cross-user checks (connections, invitations,
--     thoughts, world membership, copying shared items) go through RPCs.
--   * Content handed to another person is a snapshot, so the recipient never
--     gains read access to the sender's archive.
--   * AI export of someone else's content requires that person's explicit consent.

create extension if not exists pgcrypto with schema extensions;

-- Helpers used by policies live in a schema the Data API does not expose.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Utilities
-- ---------------------------------------------------------------------------

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Simple per-user rate limiting for social actions.
create table public.rate_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);
create index rate_events_lookup on public.rate_events (user_id, action, created_at desc);
alter table public.rate_events enable row level security;
-- no policies: only SECURITY DEFINER functions touch this table.

create or replace function private.enforce_rate_limit(p_action text, p_max integer, p_window interval)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.rate_events
  where user_id = auth.uid() and action = p_action and created_at > now() - p_window;
  if v_count >= p_max then
    raise exception 'rate_limited' using errcode = 'P0001', hint = p_action;
  end if;
  insert into public.rate_events (user_id, action) values (auth.uid(), p_action);
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text not null,
  display_name text not null,
  subtitle text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_handle_format check (handle ~ '^[a-z0-9_.]{3,30}$'),
  constraint profiles_display_name_len check (char_length(btrim(display_name)) between 1 and 60),
  constraint profiles_subtitle_len check (char_length(subtitle) <= 120)
);
create unique index profiles_handle_key on public.profiles (handle);
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Personal archive: collections and items
-- ---------------------------------------------------------------------------

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint collections_name_len check (char_length(btrim(name)) between 1 and 60),
  constraint collections_id_owner unique (id, owner_id)
);
create unique index collections_owner_name on public.collections (owner_id, lower(btrim(name)));

create table public.items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  collection_id uuid,
  title text not null,
  url text,
  note text not null default '',
  category text not null default 'Appunti',
  client_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint items_collection_same_owner foreign key (collection_id, owner_id)
    references public.collections (id, owner_id) on delete set null (collection_id),
  constraint items_title_len check (char_length(btrim(title)) between 1 and 300),
  constraint items_url_scheme check (url is null or (url ~* '^https?://' and char_length(url) <= 2048)),
  constraint items_note_len check (char_length(note) <= 10000),
  constraint items_category_len check (char_length(btrim(category)) between 1 and 40),
  constraint items_client_ref_len check (client_ref is null or char_length(client_ref) <= 64)
);
create index items_owner_created on public.items (owner_id, created_at desc);
create index items_collection on public.items (collection_id);
-- idempotent import of on-device data
create unique index items_owner_client_ref on public.items (owner_id, client_ref) where client_ref is not null;
create trigger items_touch before update on public.items
  for each row execute function private.touch_updated_at();

-- Normalise client input (bulk inserts send explicit NULLs for missing keys).
create or replace function private.normalize_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.title := btrim(coalesce(new.title, ''));
  new.note := coalesce(new.note, '');
  new.category := coalesce(nullif(btrim(new.category), ''), 'Appunti');
  new.url := nullif(btrim(coalesce(new.url, '')), '');
  return new;
end;
$$;
create trigger items_normalize before insert or update on public.items
  for each row execute function private.normalize_item();

-- ---------------------------------------------------------------------------
-- Trusted connections
-- ---------------------------------------------------------------------------

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint connections_status check (status in ('pending', 'accepted', 'declined')),
  constraint connections_not_self check (requester_id <> addressee_id)
);
create unique index connections_pair on public.connections
  (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index connections_addressee on public.connections (addressee_id);

create or replace function private.are_connected(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.connections c
    where c.status = 'accepted'
      and least(c.requester_id, c.addressee_id) = least(a, b)
      and greatest(c.requester_id, c.addressee_id) = greatest(a, b)
  );
$$;

-- ---------------------------------------------------------------------------
-- Invitations (single-use, expiring, revocable; only a hash is stored)
-- ---------------------------------------------------------------------------

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  token_hash bytea not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz
);
create index invitations_inviter on public.invitations (inviter_id, created_at desc);

-- ---------------------------------------------------------------------------
-- "Enter my world": explicit, revocable grants over a personal archive
-- ---------------------------------------------------------------------------

create table public.world_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  grantee_id uuid not null references public.profiles (id) on delete cascade,
  scope text not null default 'collections',
  can_save boolean not null default false,
  allow_ai_export boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint world_shares_scope check (scope in ('all', 'collections')),
  constraint world_shares_not_self check (owner_id <> grantee_id),
  constraint world_shares_pair unique (owner_id, grantee_id),
  constraint world_shares_id_owner unique (id, owner_id)
);
create index world_shares_grantee on public.world_shares (grantee_id);
create trigger world_shares_touch before update on public.world_shares
  for each row execute function private.touch_updated_at();

create table public.world_share_collections (
  share_id uuid not null,
  collection_id uuid not null,
  owner_id uuid not null default auth.uid(),
  primary key (share_id, collection_id),
  foreign key (share_id, owner_id) references public.world_shares (id, owner_id) on delete cascade,
  foreign key (collection_id, owner_id) references public.collections (id, owner_id) on delete cascade
);
create index world_share_collections_collection on public.world_share_collections (collection_id);

-- Does the current user hold a live grant over p_owner's archive?
create or replace function private.share_for(p_owner uuid)
returns public.world_shares
language sql
stable
security definer
set search_path = ''
as $$
  select s.* from public.world_shares s
  where s.owner_id = p_owner
    and s.grantee_id = auth.uid()
    and private.are_connected(s.owner_id, s.grantee_id)
  limit 1;
$$;

create or replace function private.can_view_collection(p_owner uuid, p_collection uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_collection is not null and exists (
    select 1 from public.world_shares s
    where s.owner_id = p_owner
      and s.grantee_id = auth.uid()
      and private.are_connected(s.owner_id, s.grantee_id)
      and (
        s.scope = 'all'
        or exists (
          select 1 from public.world_share_collections wsc
          where wsc.share_id = s.id and wsc.collection_id = p_collection
        )
      )
  );
$$;

create or replace function private.can_view_item(p_owner uuid, p_collection uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.world_shares s
    where s.owner_id = p_owner
      and s.grantee_id = auth.uid()
      and private.are_connected(s.owner_id, s.grantee_id)
      and (
        s.scope = 'all'
        or (p_collection is not null and exists (
          select 1 from public.world_share_collections wsc
          where wsc.share_id = s.id and wsc.collection_id = p_collection
        ))
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Thought of you: a dedicated snapshot sent to a trusted connection
-- ---------------------------------------------------------------------------

create table public.thoughts (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  message text not null default '',
  item_title text not null,
  item_url text,
  item_note text not null default '',
  item_category text not null default 'Appunti',
  source_item_id uuid references public.items (id) on delete set null,
  allow_ai_export boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint thoughts_message_len check (char_length(message) <= 1000),
  constraint thoughts_not_self check (sender_id <> recipient_id)
);
create index thoughts_recipient on public.thoughts (recipient_id, created_at desc);
create index thoughts_sender on public.thoughts (sender_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Our little world: collaborative collections
-- ---------------------------------------------------------------------------

create table public.worlds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worlds_name_len check (char_length(btrim(name)) between 1 and 80)
);
create trigger worlds_touch before update on public.worlds
  for each row execute function private.touch_updated_at();

create table public.world_members (
  world_id uuid not null references public.worlds (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'editor',
  status text not null default 'invited',
  allow_ai_export boolean not null default false,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  joined_at timestamptz,
  primary key (world_id, user_id),
  constraint world_members_role check (role in ('owner', 'editor')),
  constraint world_members_status check (status in ('invited', 'active'))
);
create index world_members_user on public.world_members (user_id);

create table public.world_items (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  added_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null,
  url text,
  note text not null default '',
  category text not null default 'Appunti',
  source_item_id uuid references public.items (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint world_items_title_len check (char_length(btrim(title)) between 1 and 300),
  constraint world_items_url_scheme check (url is null or (url ~* '^https?://' and char_length(url) <= 2048)),
  constraint world_items_note_len check (char_length(note) <= 10000)
);
create index world_items_world on public.world_items (world_id, created_at desc);
create unique index world_items_source on public.world_items (world_id, source_item_id) where source_item_id is not null;
create trigger world_items_normalize before insert on public.world_items
  for each row execute function private.normalize_item();

create or replace function private.world_role(p_world uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.world_members m
  where m.world_id = p_world and m.user_id = auth.uid() and m.status = 'active';
$$;

create or replace function private.is_world_member(p_world uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.world_role(p_world) is not null;
$$;

create or replace function private.is_world_invitee(p_world uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.world_members m
    where m.world_id = p_world and m.user_id = auth.uid()
  );
$$;

create or replace function private.shares_world_with(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.world_members me
    join public.world_members them on them.world_id = me.world_id
    where me.user_id = auth.uid() and them.user_id = p_other
  );
$$;

-- Owner becomes an active member of their own world automatically.
create or replace function private.add_world_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.world_members (world_id, user_id, role, status, allow_ai_export, invited_by, joined_at)
  values (new.id, new.owner_id, 'owner', 'active', true, new.owner_id, now());
  return new;
end;
$$;
create trigger worlds_add_owner after insert on public.worlds
  for each row execute function private.add_world_owner();

-- ---------------------------------------------------------------------------
-- Profile visibility
-- ---------------------------------------------------------------------------

create or replace function private.can_see_profile(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_id = auth.uid()
    or exists (
      select 1 from public.connections c
      where least(c.requester_id, c.addressee_id) = least(p_id, auth.uid())
        and greatest(c.requester_id, c.addressee_id) = greatest(p_id, auth.uid())
        and (c.status in ('accepted', 'pending'))
    )
    or private.shares_world_with(p_id);
$$;

-- ---------------------------------------------------------------------------
-- New-user bootstrap
-- ---------------------------------------------------------------------------

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text;
  v_handle text;
  v_name text;
begin
  v_base := regexp_replace(lower(split_part(coalesce(new.email, ''), '@', 1)), '[^a-z0-9_.]', '', 'g');
  if char_length(v_base) < 3 then
    v_base := v_base || 'friend';
  end if;
  v_base := left(v_base, 22);
  v_handle := v_base;
  while exists (select 1 from public.profiles where handle = v_handle) loop
    v_handle := v_base || '_' || substr(md5(random()::text), 1, 5);
  end loop;

  v_name := left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 60);
  if v_name = '' then
    v_name := initcap(split_part(coalesce(new.email, 'friend'), '@', 1));
  end if;
  v_name := left(v_name, 60);

  insert into public.profiles (id, handle, display_name) values (new.id, v_handle, v_name);
  insert into public.collections (owner_id, name, position) values
    (new.id, 'Idee', 0), (new.id, 'Viaggi', 1), (new.id, 'Posti da provare', 2);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.collections enable row level security;
alter table public.items enable row level security;
alter table public.connections enable row level security;
alter table public.invitations enable row level security;
alter table public.world_shares enable row level security;
alter table public.world_share_collections enable row level security;
alter table public.thoughts enable row level security;
alter table public.worlds enable row level security;
alter table public.world_members enable row level security;
alter table public.world_items enable row level security;

-- Nothing is available to anonymous visitors.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (private.can_see_profile(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke insert, delete on public.profiles from authenticated;
revoke update on public.profiles from authenticated;
grant update (handle, display_name, subtitle) on public.profiles to authenticated;

-- collections
create policy collections_select on public.collections for select to authenticated
  using (owner_id = auth.uid() or private.can_view_collection(owner_id, id));
create policy collections_insert on public.collections for insert to authenticated
  with check (owner_id = auth.uid());
create policy collections_update on public.collections for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy collections_delete on public.collections for delete to authenticated
  using (owner_id = auth.uid());

-- items
create policy items_select on public.items for select to authenticated
  using (owner_id = auth.uid() or private.can_view_item(owner_id, collection_id));
create policy items_insert on public.items for insert to authenticated
  with check (owner_id = auth.uid());
create policy items_update on public.items for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy items_delete on public.items for delete to authenticated
  using (owner_id = auth.uid());

-- connections: read your own; all writes through RPCs
create policy connections_select on public.connections for select to authenticated
  using (auth.uid() in (requester_id, addressee_id));
revoke insert, update, delete on public.connections from authenticated;

-- invitations: inviter reads their own; writes through RPCs
create policy invitations_select on public.invitations for select to authenticated
  using (inviter_id = auth.uid());
revoke all on public.invitations from authenticated;
grant select (id, inviter_id, created_at, expires_at, revoked_at, accepted_by, accepted_at)
  on public.invitations to authenticated;

-- world_shares: owner manages, grantee reads
create policy world_shares_select on public.world_shares for select to authenticated
  using (owner_id = auth.uid() or (grantee_id = auth.uid() and private.are_connected(owner_id, grantee_id)));
create policy world_shares_insert on public.world_shares for insert to authenticated
  with check (owner_id = auth.uid() and private.are_connected(owner_id, grantee_id));
create policy world_shares_update on public.world_shares for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and private.are_connected(owner_id, grantee_id));
create policy world_shares_delete on public.world_shares for delete to authenticated
  using (owner_id = auth.uid());

create policy wsc_select on public.world_share_collections for select to authenticated
  using (
    owner_id = auth.uid()
    or exists (select 1 from public.world_shares s where s.id = share_id and s.grantee_id = auth.uid()
               and private.are_connected(s.owner_id, s.grantee_id))
  );
create policy wsc_insert on public.world_share_collections for insert to authenticated
  with check (owner_id = auth.uid());
create policy wsc_delete on public.world_share_collections for delete to authenticated
  using (owner_id = auth.uid());
revoke update on public.world_share_collections from authenticated;

-- thoughts: sender and recipient read; writes through RPCs; sender may unsend
create policy thoughts_select on public.thoughts for select to authenticated
  using (auth.uid() in (sender_id, recipient_id));
create policy thoughts_delete on public.thoughts for delete to authenticated
  using (sender_id = auth.uid());
revoke insert, update on public.thoughts from authenticated;

-- worlds
create policy worlds_select on public.worlds for select to authenticated
  using (owner_id = auth.uid() or private.is_world_invitee(id));
create policy worlds_insert on public.worlds for insert to authenticated
  with check (owner_id = auth.uid());
create policy worlds_update on public.worlds for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy worlds_delete on public.worlds for delete to authenticated
  using (owner_id = auth.uid());
revoke update on public.worlds from authenticated;
grant update (name) on public.worlds to authenticated;

-- world_members: visible to fellow members (and to yourself while invited)
create policy world_members_select on public.world_members for select to authenticated
  using (user_id = auth.uid() or private.is_world_member(world_id));
create policy world_members_delete on public.world_members for delete to authenticated
  using (
    (user_id = auth.uid() and role <> 'owner')
    or (private.world_role(world_id) = 'owner' and role <> 'owner')
  );
revoke insert, update on public.world_members from authenticated;

-- world_items
create policy world_items_select on public.world_items for select to authenticated
  using (private.is_world_member(world_id));
create policy world_items_insert on public.world_items for insert to authenticated
  with check (added_by = auth.uid() and private.is_world_member(world_id));
create policy world_items_delete on public.world_items for delete to authenticated
  using (added_by = auth.uid() or private.world_role(world_id) = 'owner');
revoke update on public.world_items from authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Connections ---------------------------------------------------------------

create or replace function public.request_connection(p_handle text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_other uuid;
  v_row public.connections;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select id into v_other from public.profiles where handle = lower(btrim(ltrim(p_handle, '@')));
  if v_other is null then raise exception 'profile_not_found'; end if;
  if v_other = v_me then raise exception 'cannot_connect_to_self'; end if;

  select * into v_row from public.connections
  where least(requester_id, addressee_id) = least(v_me, v_other)
    and greatest(requester_id, addressee_id) = greatest(v_me, v_other)
  for update;

  if found then
    if v_row.status = 'accepted' then
      return 'accepted';
    elsif v_row.status = 'pending' and v_row.addressee_id = v_me then
      update public.connections set status = 'accepted', responded_at = now() where id = v_row.id;
      return 'accepted';
    elsif v_row.status = 'pending' then
      return 'pending';
    elsif v_row.requester_id = v_me and v_row.responded_at > now() - interval '30 days' then
      -- They declined recently. Do not reveal that or re-notify.
      return 'pending';
    else
      perform private.enforce_rate_limit('connection_request', 30, interval '1 day');
      update public.connections
        set requester_id = v_me, addressee_id = v_other, status = 'pending',
            created_at = now(), responded_at = null
        where id = v_row.id;
      return 'pending';
    end if;
  end if;

  perform private.enforce_rate_limit('connection_request', 30, interval '1 day');
  insert into public.connections (requester_id, addressee_id) values (v_me, v_other);
  return 'pending';
end;
$$;

create or replace function public.respond_connection(p_connection uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  update public.connections
    set status = case when p_accept then 'accepted' else 'declined' end,
        responded_at = now()
    where id = p_connection and addressee_id = auth.uid() and status = 'pending'
    returning status into v_status;
  if v_status is null then raise exception 'connection_not_found'; end if;
  return v_status;
end;
$$;

-- Removing a connection (or cancelling a request) also revokes every grant
-- between the two people. Shared worlds remain, but no new invites are possible.
create or replace function public.remove_connection(p_other uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  delete from public.connections
    where least(requester_id, addressee_id) = least(v_me, p_other)
      and greatest(requester_id, addressee_id) = greatest(v_me, p_other);
  delete from public.world_shares
    where (owner_id = v_me and grantee_id = p_other) or (owner_id = p_other and grantee_id = v_me);
end;
$$;

-- Invitations ---------------------------------------------------------------

create or replace function public.create_invitation()
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_id uuid;
  v_exp timestamptz;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform private.enforce_rate_limit('invitation', 20, interval '1 day');
  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  insert into public.invitations (inviter_id, token_hash)
    values (auth.uid(), sha256(convert_to(v_token, 'UTF8')))
    returning invitations.id, invitations.expires_at into v_id, v_exp;
  return query select v_id, v_token, v_exp;
end;
$$;

create or replace function public.preview_invitation(p_token text)
returns table (inviter_name text, inviter_handle text, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name, p.handle, i.expires_at
  from public.invitations i
  join public.profiles p on p.id = i.inviter_id
  where i.token_hash = sha256(convert_to(p_token, 'UTF8'))
    and i.revoked_at is null and i.accepted_at is null and i.expires_at > now()
    and auth.uid() is not null;
$$;

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_inv public.invitations;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  perform private.enforce_rate_limit('invitation_accept', 30, interval '1 hour');
  select * into v_inv from public.invitations
    where token_hash = sha256(convert_to(p_token, 'UTF8'))
    for update;
  if not found or v_inv.revoked_at is not null or v_inv.accepted_at is not null or v_inv.expires_at <= now() then
    raise exception 'invitation_invalid';
  end if;
  if v_inv.inviter_id = v_me then raise exception 'cannot_accept_own_invitation'; end if;

  update public.invitations set accepted_by = v_me, accepted_at = now() where id = v_inv.id;

  insert into public.connections (requester_id, addressee_id, status, responded_at)
    values (v_inv.inviter_id, v_me, 'accepted', now())
  on conflict ((least(requester_id, addressee_id)), (greatest(requester_id, addressee_id)))
    do update set status = 'accepted', responded_at = now();
  return v_inv.inviter_id;
end;
$$;

create or replace function public.revoke_invitation(p_invitation uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.invitations set revoked_at = now()
  where id = p_invitation and inviter_id = auth.uid() and accepted_at is null and revoked_at is null;
$$;

-- Enter my world: replace the collection list of a grant atomically ---------

create or replace function public.set_world_share(
  p_grantee uuid,
  p_scope text,
  p_can_save boolean,
  p_allow_ai_export boolean,
  p_collection_ids uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_share uuid;
begin
  insert into public.world_shares (owner_id, grantee_id, scope, can_save, allow_ai_export)
    values (auth.uid(), p_grantee, p_scope, p_can_save, p_allow_ai_export)
  on conflict (owner_id, grantee_id)
    do update set scope = excluded.scope, can_save = excluded.can_save,
                  allow_ai_export = excluded.allow_ai_export
  returning id into v_share;

  delete from public.world_share_collections where share_id = v_share;
  if p_scope = 'collections' and p_collection_ids is not null then
    insert into public.world_share_collections (share_id, collection_id, owner_id)
      select v_share, c, auth.uid() from unnest(p_collection_ids) as c;
  end if;
  return v_share;
end;
$$;

-- Copy a shared item into my own archive (requires the "save" permission) ----

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

  insert into public.items (owner_id, collection_id, title, url, note, category)
    values (v_me, p_collection, v_src.title, v_src.url, v_src.note, v_src.category)
    returning id into v_new;
  return v_new;
end;
$$;

-- Thought of you -----------------------------------------------------------

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
                               item_category, source_item_id, allow_ai_export)
    values (v_me, p_recipient, left(coalesce(p_message, ''), 1000), v_item.title, v_item.url,
            v_item.note, v_item.category, v_item.id, coalesce(p_allow_ai_export, false))
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.mark_thought_read(p_thought uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.thoughts set read_at = coalesce(read_at, now())
  where id = p_thought and recipient_id = auth.uid();
$$;

-- Keep a received thought: copies the snapshot into my archive.
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
  insert into public.items (owner_id, title, url, note, category)
    values (auth.uid(), v_t.item_title, v_t.item_url, v_t.item_note, v_t.item_category)
    returning id into v_new;
  update public.thoughts set read_at = coalesce(read_at, now()) where id = p_thought;
  return v_new;
end;
$$;

-- Our little world ---------------------------------------------------------

create or replace function public.invite_to_world(p_world uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  if private.world_role(p_world) is null then raise exception 'world_not_found'; end if;
  if not private.are_connected(v_me, p_user) then raise exception 'not_connected'; end if;
  perform private.enforce_rate_limit('world_invite', 100, interval '1 day');
  insert into public.world_members (world_id, user_id, role, status, invited_by)
    values (p_world, p_user, 'editor', 'invited', v_me)
  on conflict (world_id, user_id) do nothing;
end;
$$;

create or replace function public.respond_world_invite(p_world uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_accept then
    update public.world_members set status = 'active', joined_at = now()
      where world_id = p_world and user_id = auth.uid() and status = 'invited';
  else
    delete from public.world_members
      where world_id = p_world and user_id = auth.uid() and status = 'invited';
  end if;
  if not found then raise exception 'invite_not_found'; end if;
end;
$$;

-- Each member decides whether *their own* contributions may be exported to AI
-- by the other members.
create or replace function public.set_world_ai_consent(p_world uuid, p_allow boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.world_members set allow_ai_export = p_allow
  where world_id = p_world and user_id = auth.uid() and status = 'active';
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
  insert into public.world_items (world_id, added_by, title, url, note, category, source_item_id)
    values (p_world, auth.uid(), v_item.title, v_item.url, v_item.note, v_item.category, v_item.id)
  on conflict (world_id, source_item_id) where source_item_id is not null do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- AI Context Builder: server-side consent checks --------------------------

create or replace function public.ai_export_world(p_world uuid)
returns table (title text, url text, note text, category text, collection text, added_by_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select wi.title, wi.url, wi.note, wi.category, w.name, p.display_name
  from public.world_items wi
  join public.worlds w on w.id = wi.world_id
  join public.profiles p on p.id = wi.added_by
  left join public.world_members m on m.world_id = wi.world_id and m.user_id = wi.added_by
  where wi.world_id = p_world
    and private.is_world_member(p_world)
    and (wi.added_by = auth.uid() or coalesce(m.allow_ai_export, false))
  order by wi.created_at desc;
$$;

create or replace function public.ai_export_shared(p_owner uuid)
returns table (title text, url text, note text, category text, collection text, added_by_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.title, i.url, i.note, i.category, c.name, p.display_name
  from public.items i
  join public.profiles p on p.id = i.owner_id
  left join public.collections c on c.id = i.collection_id
  where i.owner_id = p_owner
    and p_owner <> auth.uid()
    and coalesce((private.share_for(p_owner)).allow_ai_export, false)
    and private.can_view_item(i.owner_id, i.collection_id)
  order by i.created_at desc;
$$;

create or replace function public.ai_export_thoughts()
returns table (title text, url text, note text, category text, collection text, added_by_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.item_title, t.item_url,
         case when t.message <> '' then t.item_note || E'\nDedication: ' || t.message else t.item_note end,
         t.item_category, 'Thought of you', p.display_name
  from public.thoughts t
  join public.profiles p on p.id = t.sender_id
  where t.recipient_id = auth.uid() and t.allow_ai_export
  order by t.created_at desc;
$$;

-- Account -------------------------------------------------------------------

-- Full machine-readable export of the caller's own data.
create or replace function public.export_my_data()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'collections', coalesce((select jsonb_agg(to_jsonb(c) order by c.position) from public.collections c where c.owner_id = auth.uid()), '[]'),
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at) from public.items i where i.owner_id = auth.uid()), '[]'),
    'thoughts_sent', coalesce((select jsonb_agg(to_jsonb(t)) from public.thoughts t where t.sender_id = auth.uid()), '[]'),
    'thoughts_received', coalesce((select jsonb_agg(to_jsonb(t)) from public.thoughts t where t.recipient_id = auth.uid()), '[]'),
    'worlds_owned', coalesce((select jsonb_agg(jsonb_build_object('world', to_jsonb(w),
        'items', (select coalesce(jsonb_agg(to_jsonb(wi)), '[]') from public.world_items wi where wi.world_id = w.id)))
        from public.worlds w where w.owner_id = auth.uid()), '[]'),
    'world_contributions', coalesce((select jsonb_agg(to_jsonb(wi)) from public.world_items wi where wi.added_by = auth.uid()), '[]')
  );
$$;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: nothing callable anonymously
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.request_connection(text),
  public.respond_connection(uuid, boolean),
  public.remove_connection(uuid),
  public.create_invitation(),
  public.preview_invitation(text),
  public.accept_invitation(text),
  public.revoke_invitation(uuid),
  public.set_world_share(uuid, text, boolean, boolean, uuid[]),
  public.save_shared_item(uuid, uuid),
  public.send_thought(uuid, uuid, text, boolean),
  public.mark_thought_read(uuid),
  public.save_thought(uuid),
  public.invite_to_world(uuid, uuid),
  public.respond_world_invite(uuid, boolean),
  public.set_world_ai_consent(uuid, boolean),
  public.add_item_to_world(uuid, uuid),
  public.ai_export_world(uuid),
  public.ai_export_shared(uuid),
  public.ai_export_thoughts(),
  public.export_my_data(),
  public.delete_my_account()
to authenticated;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.are_connected(uuid, uuid),
  private.can_view_collection(uuid, uuid),
  private.can_view_item(uuid, uuid),
  private.can_see_profile(uuid),
  private.share_for(uuid),
  private.world_role(uuid),
  private.is_world_member(uuid),
  private.is_world_invitee(uuid),
  private.shares_world_with(uuid)
to authenticated;

alter default privileges in schema public revoke execute on functions from public, anon;

-- ---------------------------------------------------------------------------
-- Realtime synchronisation (RLS applies to change events)
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.items, public.collections, public.connections, public.world_shares,
      public.world_share_collections, public.thoughts, public.worlds,
      public.world_members, public.world_items, public.profiles;
  end if;
end;
$$;
