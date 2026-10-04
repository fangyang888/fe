"""Validate a completed research run, including an independent truncated rerun.
Usage: python verify.py INPUT.json RESULTS_DIRECTORY
"""
import json, os, subprocess, sys, tempfile
from pathlib import Path

source, directory = Path(sys.argv[1]), Path(sys.argv[2])
data = json.loads(source.read_text())
full = json.loads((directory/'rows.json').read_text())
report = json.loads((directory/'report.json').read_text())
assert report['vector_dimensions'] == {'stage':41, 'numbers':343}
for observed, exported in zip(full, data['rows']):
    assert observed['picks']['original'] == exported['expert_picks']['original']
    for model, picks in observed['picks'].items():
        assert len(picks) == len(set(picks)) == 32
        assert all(isinstance(n,int) and 1<=n<=49 for n in picks)
        assert observed['hits'][model] == (exported['actual'] in picks)
latest = tuple(report['latest_scored'][k] for k in ['year','No'])
for neighbors in report['current']['neighbors'].values():
    assert all((n['year'],n['No'])<=latest and -1.000001<=n['cosine']<=1.000001 for n in neighbors)
# Cut before 2026-226 and replace the unread current outcome with a different
# placeholder. Earlier predictions and the upcoming forecast must stay identical.
cut = next(i for i,r in enumerate(data['rows']) if (r['year'],r['No'])==(2026,226))
prefix = {'history':data['history'][:data['rows'][cut]['t']], 'rows':data['rows'][:cut+1]}
prefix['rows'][-1] = {**prefix['rows'][-1], 'actual':49, 'unlabeled':True}
with tempfile.TemporaryDirectory(prefix='likely32-vector-') as temp:
    root = Path(temp); path = root/'input.json'; path.write_text(json.dumps(prefix))
    subprocess.run([sys.executable,str(Path(__file__).with_name('research.py')),str(path),str(root/'result')],check=True,stdout=subprocess.DEVNULL,env={**os.environ,'OPENBLAS_NUM_THREADS':'1'})
    earlier=json.loads((root/'result/rows.json').read_text())
    current=json.loads((root/'result/report.json').read_text())
    assert earlier == full[:cut], 'Future data altered earlier forecasts'
    assert current['current']['picks'] == full[cut]['picks'], 'Forecast used its own target outcome'
    assert current['selected_vector'] == report['selected_vector'], 'Later outcomes altered development selection'
checks=['41/343 dimensions','all forecasts contain 32 unique valid numbers','original picks match lab oracle','special-code scoring','neighbor chronology','prefix invariance for all models','unseen outcome invariance','development-only selection']
(directory/'verification.json').write_text(json.dumps({'passed':checks},indent=2))
print('PASS:', '; '.join(checks))
