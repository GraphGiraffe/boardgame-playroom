#!/usr/bin/env python3
"""Manually deploy an immutable release to an existing protected Pages project."""
import argparse
import base64
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tempfile
import urllib.error
import urllib.request
import uuid
from zipfile import ZipFile
import runpy

wrap_private_worker = runpy.run_path(str(Path(__file__).with_name('pack_worker.py')))['wrap_private_worker']

ROOT = Path(__file__).resolve().parents[1]
WRANGLER = 'wrangler@4.149.0'
PRIVATE = {'_worker.js', '_routes.json', 'manifest.webmanifest'}


def required(name):
    value = os.environ.get(name, '')
    if not value:
        raise ValueError(f'Missing protected configuration: {name}')
    return value


def archive_files(path):
    with ZipFile(path) as archive:
        infos = [i for i in archive.infolist() if not i.is_dir()]
        if len(infos) > 300 or sum(i.file_size for i in infos) > 64 * 1024 * 1024:
            raise ValueError('Archive exceeds deployment limits')
        files = {}
        for info in infos:
            name = info.filename
            if (not name or name.startswith('/') or '..' in PurePosixPath(name).parts
                    or '\\' in name or name in files or (info.external_attr >> 16) & 0o170000 == 0o120000):
                raise ValueError('Unsafe or duplicate archive path')
            files[name] = archive.read(info)
        return files


def checked_file(path, sums):
    path = Path(path)
    matches = re.findall(r'^([a-f0-9]{64})\s+\*?'+re.escape(path.name)+r'$', Path(sums).read_text(), re.M)
    if len(matches) != 1 or hashlib.sha256(path.read_bytes()).hexdigest() != matches[0]:
        raise ValueError('Archive checksum mismatch: '+path.name)
    return path


def private_wrapper(args):
    base = getattr(args, 'protected_base', None)
    if not base:
        return base64.b64decode(required('PAGES_PRIVATE_WRAPPER_B64'), validate=True)
    sums = getattr(args, 'checksums', None)
    if not sums:
        raise ValueError('--protected-base requires --checksums')
    files = archive_files(checked_file(base, sums))
    if not PRIVATE <= files.keys():
        raise ValueError('Protected base is missing its access wrapper')
    output = io.BytesIO()
    with ZipFile(output, 'w') as archive:
        for name in sorted(PRIVATE):
            archive.writestr(name, files[name])
    return output.getvalue()


def prepare(public, sums, wrapper, destination, catalog_channel=""):
    matches = re.findall(r'^([a-f0-9]{64})\s+\*?playroom-pwa\.zip$', Path(sums).read_text(), re.M)
    if len(matches) != 1 or hashlib.sha256(Path(public).read_bytes()).hexdigest() != matches[0]:
        raise ValueError('Release checksum mismatch')
    raw = archive_files(public)
    indexes = [n for n in raw if n == 'index.html' or n.endswith('/index.html')]
    if len(indexes) != 1:
        raise ValueError('Expected one PWA root')
    prefix = indexes[0][:-len('index.html')]
    if any(not n.startswith(prefix) for n in raw):
        raise ValueError('Files outside PWA root')
    files = {n[len(prefix):]: b for n, b in raw.items()}
    if {'_worker.js', '_routes.json'} & files.keys():
        raise ValueError('Private wrapper in public release')
    worker = files['sw.js'].decode()
    integrity = json.loads(re.search(r'const INTEGRITY=(.*?);', worker).group(1))
    for name, digest in integrity.items():
        if not name.startswith('./') or hashlib.sha256(files[name[2:]]).hexdigest() != digest:
            raise ValueError('Runtime integrity mismatch')
    refs = re.findall(r'(?:src|href)="([^"?#]+\.(?:js|css))"', files['index.html'].decode())
    if not refs or any(not re.search(r'\.[a-f0-9]{16}\.(js|css)$', n) or n not in files or './'+n not in integrity for n in refs):
        raise ValueError('Non-versioned or missing shell assets')
    for name in refs:
        if re.sub(r'\.[a-f0-9]{16}(?=\.(js|css)$)', '', name) in files:
            raise ValueError('Duplicate canonical shell assets')
    installed = next(files[n].decode() for n in refs if n.startswith('installed-packs.'))
    ids=set(re.findall(r'"id"\s*:\s*"([a-z-]+)"', installed))
    remote=not ids and 'PlayroomInstalledPacks = []' in installed
    if not remote and not {'uno', 'domino', 'durak', 'checkers', 'snakes', 'tictactoe', 'battleship', 'pexeso', 'ludo', 'yatzy', 'gofish', 'oldmaid'} <= ids:
        raise ValueError('Release must contain all twelve packs or use the remote catalog')
    if remote and not any(name.startswith('app/remote-catalog.') for name in refs):
        raise ValueError('Remote-catalog runtime is missing')
    private = archive_files(io.BytesIO(wrapper))
    if set(private) != PRIVATE or any(not v for v in private.values()):
        raise ValueError('Private wrapper must contain exactly worker, routes and manifest')
    routes = json.loads(private['_routes.json'])
    if routes.get('version') != 1 or '/*' not in routes.get('include', []):
        raise ValueError('Wrapper must protect the whole site')
    # All executable assets must pass through the access worker.
    import fnmatch
    if any(fnmatch.fnmatchcase('/'+n, pattern) for n in [*refs, '', 'index.html', 'sw.js'] for pattern in routes.get('exclude', [])):
        raise ValueError('Executable asset bypasses the access worker')
    if destination.exists() and any(destination.iterdir()):
        raise ValueError('Deployment destination must be empty')
    destination.mkdir(parents=True, exist_ok=True)
    files.update(private)
    files['_worker.js'] = wrap_private_worker(files['_worker.js'], catalog_channel)
    for name, content in files.items():
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
    return {'sha256': matches[0], 'files': len(files), 'runtimeSha256': {n: hashlib.sha256(b).hexdigest() for n,b in files.items() if n not in PRIVATE}}


class Pages:
    def __init__(self):
        account, project = required('CLOUDFLARE_ACCOUNT_ID'), required('CLOUDFLARE_PAGES_PROJECT')
        if not re.fullmatch(r'[a-fA-F0-9]{32}', account) or not re.fullmatch(r'[a-z0-9][a-z0-9-]*', project):
            raise ValueError('Invalid account or project')
        self.project = project
        self.base = f'https://api.cloudflare.com/client/v4/accounts/{account}/pages/projects/{project}'
        self.token = required('CLOUDFLARE_API_TOKEN')

    def api(self, method='GET', suffix='', payload=None):
        request = urllib.request.Request(self.base+suffix, method=method,
            headers={'Authorization': 'Bearer '+self.token, 'Content-Type': 'application/json'},
            data=json.dumps(payload).encode() if payload is not None else b'{}' if method == 'POST' else None)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                data = json.load(response)
        except urllib.error.HTTPError as error:
            raise ValueError(f'Cloudflare request failed: HTTP {error.code}') from None
        if not data.get('success'):
            raise ValueError('Cloudflare rejected the operation')
        return data['result']

    def production_target(self, deployment):
        if not re.fullmatch(r'[a-f0-9-]{36}', deployment):
            raise ValueError('Invalid deployment ID')
        target = self.api(suffix='/deployments/'+deployment)
        if target.get('environment') != 'production' or target.get('latest_stage', {}).get('status') != 'success':
            raise ValueError('Rollback requires a successful production deployment')
        return target

    def manual_uploads(self, project):
        source = project.get('source') or {}
        if source.get('type') not in ('github', 'gitlab'):
            return
        config = source.get('config') or {}
        if config.get('production_deployments_enabled') is False and config.get('preview_deployment_setting') == 'none':
            return
        self.api('PATCH', payload={'source': {'type': source['type'], 'config': {
            'production_deployments_enabled': False, 'preview_deployment_setting': 'none'}}})
        actual = self.api().get('source', {}).get('config', {})
        if actual.get('production_deployments_enabled') is not False or actual.get('preview_deployment_setting') != 'none':
            raise ValueError('Could not disable competing Git deployments')

    def rollback(self, deployment):
        target = self.production_target(deployment)
        self.api('POST', '/deployments/'+deployment+'/rollback')
        if self.api().get('canonical_deployment', {}).get('id') != deployment:
            raise ValueError('Rollback was not confirmed')
        return target


def smoke(url, runtime=None, online_only=False, report_path=None):
    env = dict(os.environ, PLAYROOM_DEPLOY_URL=url)
    if report_path:
        env['PLAYROOM_SMOKE_REPORT'] = str(report_path)
    if runtime:
        env['PLAYROOM_DEPLOY_DIR'] = str(runtime)
    env['PLAYROOM_SMOKE_ONLINE_ONLY'] = '1' if online_only else '0'
    subprocess.run(['node', str(ROOT/'scripts/pages-smoke.cjs')], env=env, check=True)


def run(args):
    required('PAGES_SMOKE_PASSWORD')
    pages = Pages()
    project = pages.api()
    production = required('CLOUDFLARE_PRODUCTION_BRANCH')
    if project.get('production_branch') != production:
        raise ValueError('Configured production branch differs from existing project')
    origin = 'https://'+project['subdomain']
    # Never create projects or infer a destination from a branch or screenshot.
    expected = required('CLOUDFLARE_PAGES_ORIGIN').rstrip('/')
    if expected != origin and expected not in ['https://'+d for d in project.get('domains', [])]:
        raise ValueError('Configured origin does not belong to the existing project')
    previous = project.get('canonical_deployment', {}).get('id')
    report = {'project': pages.project, 'origin': expected, 'previousDeployment': previous, 'operation': args.operation}
    if args.operation == 'preflight':
        source = project.get('source') or {}
        config = source.get('config') or {}
        r2_bindings = ((project.get('deployment_configs') or {}).get('production') or {}).get('r2_buckets') or {}
        report.update(productionBranch=production, sourceType=source.get('type'),
            gitProductionBuilds=config.get('production_deployments_enabled'),
            gitPreviewBuilds=config.get('preview_deployment_setting'),
            buildOutput=(project.get('build_config') or {}).get('destination_dir'),
            productionPackBucket=(r2_bindings.get('PLAYROOM_PACKS') or {}).get('name'),
            status='preflight-started', deployments=[{
                'id': d['id'], 'url': d['url'], 'environment': d.get('environment'),
                'status': d.get('latest_stage', {}).get('status'), 'created': d.get('created_on')
            } for d in pages.api(suffix='/deployments')[:10]])
        args.report.write_text(json.dumps(report, indent=2)+'\n')
        print(json.dumps(report))
        private = archive_files(io.BytesIO(private_wrapper(args)))
        if set(private) != PRIVATE:
            raise ValueError('Invalid private wrapper archive')
        with tempfile.TemporaryDirectory(prefix='pages-wrapper-') as tmp:
            worker = Path(tmp)/'_worker.js'
            worker.write_bytes(wrap_private_worker(private['_worker.js']))
            subprocess.run(['node', str(ROOT/'scripts/pages-wrapper-check.cjs'), str(worker)], check=True)
        target = pages.production_target(args.deployment) if args.deployment else None
        smoke(target['url'] if target else expected)
        report.update(status='preflight-passed', productionBranch=production, verifiedDeployment=target['id'] if target else previous)
        return report
    if args.operation == 'rollback':
        target = pages.production_target(args.deployment)
        smoke(target['url'])
        pages.manual_uploads(project)
        target = pages.rollback(args.deployment)
        smoke(target['url']);smoke(expected)
        report.update(deployment=target['id'], status='rolled-back')
        return report
    if not re.fullmatch(r'v\d+\.\d+\.\d+(?:-rc\.\d+)?', args.release or ''):
        raise ValueError('Expected an immutable release tag')
    if not previous:
        raise ValueError('Existing production deployment required for rollback')
    # Never use an unprotected accidental Git build as an automatic fallback.
    fallback = previous
    limited_fallback = False
    if args.operation == 'deploy':
        if args.deployment and args.deployment != previous:
            target = pages.production_target(args.deployment)
            smoke(target['url'], online_only=True)
            fallback = target['id']
            limited_fallback = True
            report.update(fallbackDeployment=fallback, fallbackScope='protected-online')
        else:
            smoke(pages.production_target(previous)['url'])
    with tempfile.TemporaryDirectory(prefix='playroom-pages-') as tmp:
        tmp = Path(tmp)
        public = getattr(args, 'public', None)
        if public:
            if not args.checksums or not args.protected_base or not args.commit:
                raise ValueError('Local deploy requires --checksums, --protected-base and --commit')
            public, sums, sha = Path(public), args.checksums, args.commit
            if public.name != 'playroom-pwa.zip':
                raise ValueError('Expected release asset playroom-pwa.zip')
        else:
            repo = required('GITHUB_REPOSITORY')
            release = json.loads(subprocess.check_output(['gh', 'release', 'view', args.release, '--repo', repo, '--json', 'tagName,isDraft,targetCommitish']))
            if release['isDraft'] or release['tagName'] != args.release:
                raise ValueError('Release must already be published')
            subprocess.run(['gh', 'release', 'download', args.release, '--repo', repo, '--pattern', 'playroom-pwa.zip', '--pattern', 'SHA256SUMS', '--dir', str(tmp)], check=True)
            public, sums = tmp/'playroom-pwa.zip', tmp/'SHA256SUMS'
            sha = subprocess.check_output(['git', 'rev-list', '-n', '1', args.release], text=True).strip()
        if not re.fullmatch(r'[a-f0-9]{40}', sha):
            raise ValueError('Release requires an exact source commit')
        catalog_channel=getattr(args,'pack_channel','')
        if catalog_channel and args.operation!='preview':
            raise ValueError('An isolated catalog is permitted only for preview')
        digest = prepare(public, sums, private_wrapper(args), tmp/'site', catalog_channel)
        subprocess.run(['node', str(ROOT/'scripts/pages-wrapper-check.cjs'), str(tmp/'site/_worker.js')], check=True)
        report.update(packChannel=catalog_channel, release=args.release, commit=sha, sha256=digest['sha256'], source='local' if args.public else 'github-release')
        run_id = os.environ.get('GITHUB_RUN_ID') or 'local-'+uuid.uuid4().hex[:12]
        preview_branch = 'verify-'+run_id
        if preview_branch == production:
            raise ValueError('Preview branch equals production branch')
        def upload(branch):
            subprocess.run(['npx', '--yes', WRANGLER, 'pages', 'deploy', str(tmp/'site'), '--project-name', pages.project,
                '--branch', branch, '--commit-hash', sha, '--commit-message', args.release+' '+run_id], check=True)
            deployments = pages.api(suffix='/deployments')
            matches = [d for d in deployments if d.get('deployment_trigger', {}).get('metadata', {}).get('branch') == branch and
                d.get('deployment_trigger', {}).get('metadata', {}).get('commit_hash') == sha]
            if not matches:
                raise ValueError('Uploaded deployment not found')
            return max(matches, key=lambda d:d.get('created_on',''))
        # A preview is an explicit operation only. Production deploy uploads once.
        if args.operation == 'preview':
            baseline_file=tmp/'production-before.json'
            smoke(expected,online_only=True,report_path=baseline_file)
            production_before=json.loads(baseline_file.read_text())
            pages.manual_uploads(project)
            if catalog_channel:
                configs=project.get('deployment_configs') or {}
                binding=(configs.get('production') or {}).get('r2_buckets',{}).get('PLAYROOM_PACKS')
                if not binding: raise ValueError('Production R2 binding is missing')
                preview_config=dict(configs.get('preview') or {})
                buckets=dict(preview_config.get('r2_buckets') or {});buckets['PLAYROOM_PACKS']=binding;preview_config['r2_buckets']=buckets
                pages.api('PATCH',payload={'deployment_configs':{'preview':preview_config}})
                if pages.api().get('canonical_deployment',{}).get('id')!=previous: raise ValueError('Production changed before preview upload')
            preview = upload(preview_branch)
            if preview.get('environment') != 'preview':
                raise ValueError('Expected preview deployment')
            preview_file=tmp/'preview-verification.json'
            smoke(preview['url'], tmp/'site',report_path=preview_file)
            after_file=tmp/'production-after.json'
            smoke(expected,online_only=True,report_path=after_file)
            production_after=json.loads(after_file.read_text())
            if production_before!=production_after: raise ValueError('Production runtime or catalog changed during preview')
            report.update(productionBefore=production_before,productionAfter=production_after,previewVerified=json.loads(preview_file.read_text()),productionUnchanged=True)
            if pages.api().get('canonical_deployment',{}).get('id')!=previous: raise ValueError('Production changed during preview deployment')
            report.update(status='preview-verified', previewDeployment=preview['id'], previewUrl=preview['url'])
            return report
        if pages.api().get('canonical_deployment', {}).get('id') != previous:
            raise ValueError('Production changed during preparation; retry explicitly')
        pages.manual_uploads(project)
        try:
            deployed = upload(production)
            if deployed.get('environment') != 'production':
                raise ValueError('Expected production deployment')
            smoke(deployed['url'], tmp/'site');smoke(expected, tmp/'site')
            if pages.api().get('canonical_deployment', {}).get('id') != deployed['id']:
                raise ValueError('Production deployment was not confirmed')
            report.update(deployment=deployed['id'], status='published')
        except Exception:
            pages.rollback(fallback)
            smoke(expected, online_only=limited_fallback)
            print('Production verification failed; protected fallback restored.')
            raise
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pack-channel', default='')
    parser.add_argument('operation', choices=['deploy', 'preview', 'rollback', 'preflight'])
    parser.add_argument('--release')
    parser.add_argument('--deployment')
    parser.add_argument('--public', type=Path, help='Local immutable playroom-pwa.zip; no GitHub access needed')
    parser.add_argument('--checksums', type=Path)
    parser.add_argument('--protected-base', type=Path, help='Private ZIP with the existing access wrapper')
    parser.add_argument('--commit', help='Exact app commit SHA for local publication')
    parser.add_argument('--report', type=Path, default=Path('deploy-report.json'))
    args = parser.parse_args()
    try:
        report = run(args)
        args.report.write_text(json.dumps(report, indent=2)+'\n')
        print(json.dumps(report))
    except Exception as error:
        # Never print raw provider responses, command environment or auth material.
        print('Deployment failed: '+(str(error) if isinstance(error, ValueError) else type(error).__name__))
        raise SystemExit(1)
