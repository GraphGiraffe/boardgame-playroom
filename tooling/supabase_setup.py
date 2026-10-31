"""Assemble owner-applied Supabase SQL from canonical product migrations."""
from hashlib import md5
from pathlib import Path
import re

MIGRATIONS = ('supabase.sql', 'social.sql', 'signaling.sql', 'online.sql', 'host-transfer.sql', 'push.sql', 'cloud-saves.sql', 'account-sync.sql', 'room-cleanup.sql', 'registration.sql')
RPCS = ('playroom_social', 'playroom_signal', 'playroom_online', 'playroom_groups_rpc',
        'playroom_host_transfer', 'playroom_push', 'playroom_push_claim', 'playroom_push_complete',
        'playroom_push_game', 'playroom_push_activity', 'playroom_cloud_saves_rpc', 'playroom_account_sync', 'playroom_signup_name_available')


def render(root: Path) -> dict[str, str]:
    sections, bodies = [], {}
    pattern = re.compile(r'create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(.*?\)\s*returns\b.*?\bas\s*(\$\w*\$)(.*?)\2', re.I | re.S)
    for name in MIGRATIONS:
        text = (root / 'server' / name).read_text(encoding='utf-8')
        for match in pattern.finditer(text):
            bodies[match[1]] = match[3]
        # Each source owns its outer transaction. The combined owner script has
        # one transaction, so remove only the first/last SQL statements.
        lines = text.splitlines()
        statements = [i for i, line in enumerate(lines) if line.strip() and not line.lstrip().startswith('--')]
        if not statements or lines[statements[0]].strip().lower() != 'begin;' or lines[statements[-1]].strip().lower() != 'commit;':
            raise ValueError(f'{name}: expected outer BEGIN/COMMIT')
        del lines[statements[-1]]
        del lines[statements[0]]
        sections.append('-- Source: server/' + name + '\n' + '\n'.join(lines).strip())
    missing = set(RPCS) - bodies.keys()
    if missing:
        raise ValueError('Missing RPC bodies: ' + ', '.join(sorted(missing)))
    rows = ',\n'.join(" ('" + name + "','" + md5(bodies[name].encode('utf-8')).hexdigest() + "')" for name in RPCS)
    private = re.search(r"function playroom_private\.cloud_saves\(.*?\bas\s*\$\$(.*?)\$\$", (root / 'server/cloud-saves.sql').read_text(), re.S)
    private_md5 = md5(private[1].encode('utf-8')).hexdigest()
    check = """-- Read-only verification; all installed/exact_match values must be true.
with expected(function_name,expected_md5) as (values
""" + rows + """
)
select e.function_name,p.oid is not null as installed,
 pg_get_function_identity_arguments(p.oid) as arguments,
 coalesce(md5(p.prosrc)=e.expected_md5,false)
 and (e.function_name<>'playroom_cloud_saves_rpc' or exists(
  select 1 from pg_proc f where f.pronamespace='playroom_private'::regnamespace
   and f.proname='cloud_saves' and md5(f.prosrc)='""" + private_md5 + """')) as exact_match
from expected e left join pg_proc p on p.proname=e.function_name
 and p.pronamespace='public'::regnamespace
order by e.function_name;
"""
    setup = '-- PlayRoom 0.20: repeatable schema update. No secrets; Push delivery stays opt-in.\n' + 'begin;\n\n' + '\n\n'.join(sections) + "\n\nnotify pgrst, 'reload schema';\ncommit;\n"
    return {'setup-supabase.sql': setup, 'check-supabase.sql': check,
            'enable-web-push.sql': (root / 'server/push/enable.sql').read_text(encoding='utf-8')}
