#!/usr/bin/env python3
from pathlib import Path
import re, sys, zipfile

root = Path(__file__).resolve().parents[2]
app = root / 'argentinia'
tools = app / 'tools'
workflow = root / '.github' / 'workflows' / 'pages.yml'
snapshot = root / 'SOURCE_SNAPSHOT_MANIFEST_23_21_6.txt'
errors = []

def err(msg): errors.append(msg)

for p in [workflow, snapshot, tools/'ci_fast_contract_manifest_23_21_0.txt', tools/'ci_regression_manifest_23_17_3_1.txt', tools/'regression_legacy_23_17_3_1.zip']:
    if not p.is_file(): err(f'missing required packaging file: {p.relative_to(root)}')
if errors:
    print('\n'.join('ERROR: '+e for e in errors)); raise SystemExit(1)

snap = {}
for line in snapshot.read_text(encoding='utf-8').splitlines():
    if '=' in line:
        k,v=line.split('=',1); snap[k.strip()]=v.strip()
try: expected = int(snap.get('CANONICAL_FAST_CONTRACTS',''))
except ValueError: expected = 0
if expected <= 0: err('invalid CANONICAL_FAST_CONTRACTS in source snapshot')
try: functions_count = int(snap.get('FUNCTIONS_COUNT',''))
except ValueError: functions_count = 0
if functions_count <= 0: err('invalid FUNCTIONS_COUNT in source snapshot')
if snap.get('PUBLIC_FIRESTORE_CONFIG_FILES') != '0': err('public Firestore config files contract is not zero')
if snap.get('CARD_IMAGE_BINARIES') != '0': err('source package card image binaries contract is not zero')

canonical = [x.strip() for x in (tools/'ci_fast_contract_manifest_23_21_0.txt').read_text(encoding='utf-8').splitlines() if x.strip() and not x.lstrip().startswith('#')]
if len(canonical) != expected: err(f'canonical manifest count={len(canonical)} but snapshot expects {expected}')
if len(canonical) != len(set(canonical)): err('canonical manifest contains duplicate test paths')
for rel in canonical:
    if not (app/rel).is_file(): err(f'missing canonical contract: {rel}')

reg = [x.strip() for x in (tools/'ci_regression_manifest_23_17_3_1.txt').read_text(encoding='utf-8').splitlines() if x.strip() and not x.lstrip().startswith('#')]
with zipfile.ZipFile(tools/'regression_legacy_23_17_3_1.zip') as z:
    archived=set(z.namelist())
    for name in reg:
        live=tools/name
        if not live.is_file(): err(f'missing live regression test: {name}'); continue
        if name not in archived: err(f'missing regression archive entry: {name}'); continue
        if z.read(name) != live.read_bytes(): err(f'regression archive drift: {name}')
    for name in sorted(archived.difference(reg)): err(f'unexpected regression archive entry: {name}')

wf=workflow.read_text(encoding='utf-8')
if re.search(r'node tools/(test_[^ ]*\.mjs|[^ ]*contract\.mjs)', wf): err('standalone static contract invocation exists outside canonical manifest')
if re.search(r"CANONICAL_FAST_CONTRACTS=[0-9]+['\"]", wf) or re.search(r'exactly [0-9]+ tests', wf) or re.search(r'All [0-9]+ canonical', wf):
    err('workflow reintroduced a hardcoded canonical test count; derive it from source snapshot instead')
if re.search(r"FUNCTIONS_COUNT=[0-9]+['\"]", wf):
    err('workflow reintroduced a hardcoded Functions count; validate the snapshot field generically instead')
if 'expected=$(sed -n' not in wf or 'CANONICAL_FAST_CONTRACTS' not in wf:
    err('workflow does not derive canonical cardinality from source snapshot')

if (app/'firestore.rules').exists() or (app/'firebase.json').exists(): err('public app source unexpectedly contains Firestore infrastructure files')

if errors:
    print(f'CI_PACKAGING_PREFLIGHT_FAILED issues={len(errors)}')
    for e in errors: print('ERROR:',e)
    raise SystemExit(1)
print(f'CI_PACKAGING_PREFLIGHT_OK canonical={len(canonical)} regression={len(reg)} functions={functions_count}')
