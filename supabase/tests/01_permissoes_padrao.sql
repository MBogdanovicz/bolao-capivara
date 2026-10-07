-- Permissões que o Supabase concede por padrão no schema public (a RLS é quem restringe).
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
