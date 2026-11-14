-- Read-only owner preflight. No keys, target IDs, queries or message bodies.
select current_setting('server_version') as server_version,
 current_setting('server_encoding') as encoding,
 exists(select 1 from pg_catalog.pg_collation where collprovider='i') as icu_available,
 current_setting('server_encoding')='UTF8' and exists(select 1 from pg_catalog.pg_collation where collprovider='i') as search_unicode_supported;
