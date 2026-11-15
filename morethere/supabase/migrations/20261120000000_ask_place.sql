-- morethere — "Sono qui": a request can carry the city you are in.
--
-- Only the city name is stored (from the phone's position, read once with
-- consent and turned into a name by our server); never coordinates.
-- Friends who are asked see it and get their places there first.

alter table public.asks add column if not exists place text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'asks_place_len') then
    alter table public.asks add constraint asks_place_len check (place is null or char_length(place) between 1 and 80);
  end if;
end;
$$;

create or replace function public.set_ask_place(p_ask uuid, p_place text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.asks set place = nullif(left(btrim(coalesce(p_place, '')), 80), '')
    where id = p_ask and owner_id = auth.uid();
  if not found then raise exception 'ask_not_found'; end if;
end;
$$;

notify pgrst, 'reload schema';
