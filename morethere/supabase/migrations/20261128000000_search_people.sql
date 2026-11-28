-- Find people by name or @username when adding a friend, as in a social network.
-- Only what is needed to recognise someone: name and username (no email, photo or
-- description), and how they relate to you. Signed-in users only, at least two
-- characters, ten results at most.
create or replace function public.search_people(p_query text)
returns table (id uuid, handle text, display_name text, relation text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_q text := lower(btrim(ltrim(coalesce(p_query, ''), '@')));
  v_like text;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if char_length(v_q) < 2 then return; end if;
  v_q := left(v_q, 40);
  v_like := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  return query
    select p.id, p.handle, p.display_name,
      case
        when c.status = 'accepted' then 'friend'
        when c.status = 'pending' and c.requester_id = v_me then 'sent'
        when c.status = 'pending' then 'received'
        else 'none'
      end
    from public.profiles p
    left join public.connections c
      on least(c.requester_id, c.addressee_id) = least(v_me, p.id)
     and greatest(c.requester_id, c.addressee_id) = greatest(v_me, p.id)
     and c.status in ('pending', 'accepted')
    where p.id <> v_me
      and (p.handle like v_like || '%'
        or lower(p.display_name) like v_like || '%'
        or lower(p.display_name) like '% ' || v_like || '%')
    order by (p.handle = v_q) desc, (lower(p.display_name) like v_like || '%') desc, p.display_name, p.handle
    limit 10;
end;
$$;

revoke all on function public.search_people(text) from public, anon;
grant execute on function public.search_people(text) to authenticated;
