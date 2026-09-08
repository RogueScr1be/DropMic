-- R0F-B1B local-development rollback only.

revoke all on function public.get_mic_flow_snapshot(text) from public, anon, authenticated;
drop function if exists public.get_mic_flow_snapshot(text);
revoke all on function public._mic_flow_snapshot_status(timestamptz, text, text, timestamptz, integer) from public, anon, authenticated;
drop function if exists public._mic_flow_snapshot_status(timestamptz, text, text, timestamptz, integer);
