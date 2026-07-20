-- UP

-- Revoke direct and inherited execution explicitly. Revoking from PUBLIC alone
-- does not remove a direct grant that may exist on the anon role.
revoke all on function public.delete_my_account() from anon;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- DOWN
-- revoke all on function public.delete_my_account() from authenticated;
-- revoke all on function public.delete_my_account() from anon;
-- revoke all on function public.delete_my_account() from public;
