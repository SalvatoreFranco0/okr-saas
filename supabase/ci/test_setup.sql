-- Estensione sottile agli helper (solo CI, mai in migrazioni).
-- tests.authenticate_as(identifier) trova l'utente via raw_user_meta_data->>'test_identifier'
-- (il seed lo imposta) ma non mette nel JWT simulato ne' 'aal' ne' 'role': qui li aggiungiamo,
-- perche' private.is_platform_admin() richiede aal2 e is_trusted_backend() legge il claim role.
create or replace function tests.authenticate_as_aal(identifier text, p_aal text default 'aal1')
returns void
language plpgsql
as $$
begin
  perform tests.authenticate_as(identifier);
  perform set_config(
    'request.jwt.claims',
    (current_setting('request.jwt.claims')::jsonb
       || jsonb_build_object('role', 'authenticated', 'aal', p_aal))::text,
    true);
end;
$$;
