revoke all on function public.audit_application_attendance() from public, anon, authenticated;
grant execute on function public.audit_application_attendance() to service_role;
