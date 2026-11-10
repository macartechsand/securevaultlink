-- 2026-11-14: client-side rotation (docs/product/innovation.md 9.2). The device that rotated a credential
-- directly with the platform (GitLab in the browser, Cloudflare in the desktop app) records it in the
-- audit trail; no value, only the connector and the item id. Safe to re-run.
create or replace function public.log_client_event(p_event text, p_target_type text default null,
  p_target_id text default null, p_details jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if p_event not in ('vault.unlocked', 'vault.unlock_failed', 'vault.recovered', 'vault.locked',
                     'file.downloaded', 'file.shared_downloaded', 'mfa.enrolled', 'mfa.disabled',
                     'session.others_signed_out', 'client.error', 'item.filled', 'security.emergency_mode',
                     'item.rotated_on_device') then
    raise exception 'Unknown event';
  end if;
  if pg_column_size(coalesce(p_details, '{}'::jsonb)) > 1024 then
    raise exception 'Details too large';
  end if;
  insert into public.audit_events (user_id, actor_id, event, target_type, target_id, source, details)
  values (auth.uid(), auth.uid(), p_event, left(p_target_type, 32), left(p_target_id, 64), 'client',
          coalesce(p_details, '{}'::jsonb));
end;
$$;
revoke all on function public.log_client_event(text, text, text, jsonb) from public, anon;
grant execute on function public.log_client_event(text, text, text, jsonb) to authenticated;
