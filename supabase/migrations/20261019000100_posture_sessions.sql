-- Phase D: security posture inputs for the signed-in user only (sessions and sharing exposure).
-- Requires 20261019000000_secured_items.sql.

-- The caller's own sessions (device = user agent, IP, last activity). Marks the current one.
create or replace function public.my_sessions()
returns table (id uuid, created_at timestamptz, last_active_at timestamptz, user_agent text, ip text, aal text, is_current boolean)
language sql stable security definer set search_path = '' as $$
  select s.id,
         s.created_at,
         coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at),
         s.user_agent,
         host(s.ip),
         s.aal::text,
         s.id::text = coalesce(auth.jwt() ->> 'session_id', '')
  from auth.sessions s
  where s.user_id = auth.uid() and (s.not_after is null or s.not_after > now())
  order by 3 desc
$$;
revoke all on function public.my_sessions() from public, anon;
grant execute on function public.my_sessions() to authenticated;

-- Ends one of the caller's other sessions (its refresh tokens stop working; an already issued
-- access token stays valid until it expires, about 1 hour).
create or replace function public.revoke_my_session(p_session uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  deleted integer;
begin
  if auth.uid() is null or not private.vault_mfa_satisfied() then
    raise exception 'Not allowed';
  end if;
  if p_session::text = coalesce(auth.jwt() ->> 'session_id', '') then
    raise exception 'Use sign out to end the current session';
  end if;
  delete from auth.sessions where id = p_session and user_id = auth.uid();
  get diagnostics deleted = row_count;
  if deleted > 0 then
    perform private.audit(auth.uid(), 'session.revoked', 'session', p_session::text);
  end if;
  return deleted > 0;
end;
$$;
revoke all on function public.revoke_my_session(uuid) from public, anon;
grant execute on function public.revoke_my_session(uuid) to authenticated;

-- What the caller is currently exposing to others (counts only).
create or replace function public.my_sharing_exposure()
returns table (
  item_shares integer, item_shares_no_expiry integer, item_shares_edit integer,
  file_shares integer, file_shares_no_expiry integer, active_transfers integer
)
language sql stable security definer set search_path = '' as $$
  select
    (select count(*)::int from public.item_shares s where s.owner_id = auth.uid() and (s.expires_at is null or s.expires_at > now())),
    (select count(*)::int from public.item_shares s where s.owner_id = auth.uid() and s.expires_at is null),
    (select count(*)::int from public.item_shares s where s.owner_id = auth.uid() and s.permission = 'edit'
       and (s.expires_at is null or s.expires_at > now())),
    (select count(*)::int from public.file_shares s where s.owner_id = auth.uid() and (s.expires_at is null or s.expires_at > now())),
    (select count(*)::int from public.file_shares s where s.owner_id = auth.uid() and s.expires_at is null),
    (select count(*)::int from public.transfers t where t.owner_id = auth.uid() and not t.revoked and t.expires_at > now()
       and t.download_count < t.max_downloads)
  where auth.uid() is not null
$$;
revoke all on function public.my_sharing_exposure() from public, anon;
grant execute on function public.my_sharing_exposure() to authenticated;
