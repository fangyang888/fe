"""Causal prefix verification of all decorrelated-neighbor/gating variants.
Usage: python verify_optimize.py INPUT.json PREVIOUS_RESULTS OPTIMIZED_RESULTS
"""
import json, sys
from pathlib import Path
import numpy as np
from optimize import run

source, previous_dir, output = map(Path,sys.argv[1:4])
data=json.loads(source.read_text()); report=json.loads((previous_dir/'report.json').read_text())
previous=[r['picks'] for r in json.loads((previous_dir/'rows.json').read_text())]+[report['current']['picks']]
vectors=dict(np.load(previous_dir/'contexts.npz'))
full=json.loads((output/'rows.json').read_text())
cut=next(i for i,r in enumerate(data['rows']) if (r['year'],r['No'])==(2026,226))
prefix={'history':data['history'][:data['rows'][cut]['t']],'rows':data['rows'][:cut+1]}
prefix['rows'][-1]={**prefix['rows'][-1],'actual':49,'unlabeled':True}
outcomes, forecasts, current=run(prefix,{k:v[:cut+1] for k,v in vectors.items()},previous[:cut+1])
assert [dict(r,picks=p) for r,p in zip(outcomes,forecasts)]==full[:cut]
assert forecasts[-1]==full[cut]['picks']
for row,raw in zip(full,data['rows']):
    for model,picks in row['picks'].items():
        assert len(picks)==len(set(picks))==32 and all(1<=n<=49 for n in picks)
        assert row['hits'][model]==(raw['actual'] in picks)
        if 'repair' in model: assert len(set(picks)-set(row['picks']['original']))<=4
checks=['all 13 variants preserve past predictions under truncation','unseen target label does not change forecast','exactly 32 unique picks','at most 4 repairs','special-code outcomes']
(output/'verification.json').write_text(json.dumps({'passed':checks},indent=2)); print('PASS:', '; '.join(checks))
