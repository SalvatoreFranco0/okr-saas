begin;
select plan(2);
select tests.rls_enabled('public');
select is((select count(*)::int from public.organizations), 2, 'il seed ha creato Alfa e Beta');
select * from finish();
rollback;
