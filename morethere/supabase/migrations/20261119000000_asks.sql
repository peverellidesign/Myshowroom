-- morethere — ask your friends for advice ("Firenze, a maggio: cosa mi consigliate?")
--
-- You write a request and choose which friends to ask. Each of them answers
-- by opening several memories of their own collection to you (the same
-- revocable permission as More for you, linked to the request).
-- Only you and the friends you asked can see a request.

create table if not exists public.asks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  constraint asks_title_len check (char_length(btrim(title)) between 1 and 120),
  constraint asks_note_len check (char_length(note) <= 1000)
);
create index if not exists asks_owner on public.asks (owner_id, created_at desc);

create table if not exists public.ask_recipients (
  ask_id uuid not null references public.asks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (ask_id, user_id),
  constraint ask_recipients_not_self check (user_id <> owner_id)
);
create index if not exists ask_recipients_user on public.ask_recipients (user_id, created_at desc);
create index if not exists ask_recipients_owner on public.ask_recipients (owner_id);

alter table public.thoughts add column if not exists ask_id uuid references public.asks (id) on delete set null;
create index if not exists thoughts_ask on public.thoughts (ask_id) where ask_id is not null;

alter table public.asks enable row level security;
alter table public.ask_recipients enable row level security;

create or replace function private.is_ask_recipient(p_ask uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.ask_recipients r where r.ask_id = p_ask and r.user_id = (select auth.uid()));
$$;

-- Reads: the owner and the friends asked. Writes only through the functions
-- below (no insert/update policies); the owner may delete the request.
create policy asks_select on public.asks for select to authenticated
  using (owner_id = (select auth.uid()) or private.is_ask_recipient(id));
create policy asks_delete on public.asks for delete to authenticated
  using (owner_id = (select auth.uid()));
create policy ask_recipients_select on public.ask_recipients for select to authenticated
  using (user_id = (select auth.uid()) or owner_id = (select auth.uid()));

create or replace function public.create_ask(p_title text, p_note text, p_recipients uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
  v_r uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if coalesce(array_length(p_recipients, 1), 0) = 0 then raise exception 'no_recipients'; end if;
  if array_length(p_recipients, 1) > 50 then raise exception 'too_many_recipients'; end if;
  foreach v_r in array p_recipients loop
    if v_r = v_me or not private.are_connected(v_me, v_r) then raise exception 'not_connected'; end if;
  end loop;
  perform private.enforce_rate_limit('ask', 20, interval '1 day');
  insert into public.asks (owner_id, title, note)
    values (v_me, btrim(coalesce(p_title, '')), left(btrim(coalesce(p_note, '')), 1000))
    returning id into v_id;
  insert into public.ask_recipients (ask_id, user_id, owner_id)
    select distinct v_id, r, v_me from unnest(p_recipients) as r;
  return v_id;
end;
$$;

-- A friend who was asked answers with some of their own memories.
create or replace function public.answer_ask(
  p_ask uuid,
  p_items uuid[],
  p_message text default '',
  p_allow_save boolean default false,
  p_allow_ai_export boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_owner uuid;
  v_item uuid;
  v_thought uuid;
  v_n integer := 0;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select a.owner_id into v_owner
    from public.asks a join public.ask_recipients r on r.ask_id = a.id and r.user_id = v_me
    where a.id = p_ask;
  if not found then raise exception 'ask_not_found'; end if;
  if coalesce(array_length(p_items, 1), 0) = 0 then raise exception 'no_items'; end if;
  if array_length(p_items, 1) > 30 then raise exception 'too_many_items'; end if;
  foreach v_item in array p_items loop
    -- Same checks as More for you: connected, own memory, rate limit.
    v_thought := public.open_item_to(v_owner, v_item, p_message, p_allow_save, p_allow_ai_export);
    update public.thoughts set ask_id = p_ask where id = v_thought;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Your data export includes the requests you made.
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
    'asks', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.asks a where a.owner_id = auth.uid()), '[]'),
    'worlds_owned', coalesce((select jsonb_agg(jsonb_build_object('world', to_jsonb(w),
        'items', (select coalesce(jsonb_agg(to_jsonb(wi)), '[]') from public.world_items wi where wi.world_id = w.id)))
        from public.worlds w where w.owner_id = auth.uid()), '[]'),
    'world_contributions', coalesce((select jsonb_agg(to_jsonb(wi)) from public.world_items wi where wi.added_by = auth.uid()), '[]')
  );
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'asks') then
    alter publication supabase_realtime add table public.asks, public.ask_recipients;
  end if;
end;
$$;

notify pgrst, 'reload schema';
