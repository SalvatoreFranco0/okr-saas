-- 0001: hardening di base e tipi enum.
-- Prima di creare tabelle: anon non deve avere privilegi per default su nulla in public.

alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- Le funzioni nascono eseguibili da PUBLIC per default in Postgres. Quel default e' globale
-- (la forma "in schema" non lo rimuove): lo togliamo per il ruolo che esegue le migrazioni,
-- cosi' ogni execute va concesso esplicitamente.
alter default privileges revoke execute on functions from public;

-- Niente introspezione GraphQL per ruoli non autenticati.
drop extension if exists pg_graphql;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create extension if not exists pg_trgm;

create type public.org_role as enum ('admin', 'manager_okr', 'team_lead', 'viewer');
create type public.okr_status as enum ('in_pianificazione', 'attivo', 'in_pausa', 'completato', 'non_raggiunto');
create type public.priority as enum ('bassa', 'media', 'alta', 'critica');
create type public.kr_status as enum ('non_iniziato', 'in_progresso', 'on_track', 'at_risk', 'completato');
