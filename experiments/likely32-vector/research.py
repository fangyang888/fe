"""Causal vector-neighbor experiment; input is the lab's causal feature export.
Run with a Python containing numpy: research.py INPUT.json OUTPUT_DIRECTORY.
No fitting, neighbor search, or parameter selection may use a target's outcome.
The last 100 periods have been explored previously and are NOT a pristine holdout.
"""
import hashlib, json, math, sys
from pathlib import Path
import numpy as np

source, output = Path(sys.argv[1]), Path(sys.argv[2])
output.mkdir(parents=True, exist_ok=True)
D = json.loads(source.read_text())
H = np.array([r['numbers'] for r in D['history']]) - 1
R = D['rows']; N = len(R); ids = np.arange(49)
# Fix the candidate list and selection criterion before calculating outcomes.
models = [f'{family}_{label}_{k}' for family in ['stage', 'numbers'] for label in ['number', 'rank', 'category'] for k in [40, 80]]
models += [f'router_{family}_{k}' for family in ['stage', 'numbers'] for k in [40,80]]
protocol = {'input_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'models': models, 'metric': 'cosine; fixed feature scales; no full-data normalization',
 'selection': 'maximize minimum coverage in 2025 and 2026 1..175; tie combined wins then declared model order',
 'neighbors': 'only earlier labeled states; minimum 80 eligible states; weights exp((cosine-max_cosine)/0.15) normalized to K',
 'reference': 'original and prior two-draw overlap KNN (60 neighbors)',
 'evaluation': '2026 176..275 is previously explored history; not an untouched holdout',
 'router': 'five existing lab experts; local weighted hit rate with 20-observation uniform-coverage prior; switch only if >=3 percentage points over original; tie original then fixed expert order',
 'number_prior': '49 uniform pseudo-counts', 'rank_prior': '49 uniform pseudo-counts over seven bins of seven ranks',
 'category_prior': '98 candidate exposures and 2 wins for each of six groups',
 'picks': 'exactly 32 every period; no selective skipping; ties original rank',
 'warmup': 'context starts at 50 draws; original fallback before 80 eligible historical states'}
(output/'protocol.json').write_text(json.dumps(protocol, ensure_ascii=False, indent=2))

def unit(x):
    x = np.asarray(x, dtype=float)
    return x / max(float(np.linalg.norm(x)), 1e-12)

def rank_order(scores, rank):
    return np.lexsort((rank, -scores))[:32]

F = np.array([r['features'] for r in R]); groups = F[:,:,3].astype(int)
orders = np.argsort(-F[:,:,2], axis=1, kind='stable')
ranks = np.argsort(orders, axis=1, kind='stable')
y = np.array([r['actual']-1 for r in R]); actual_rank = ranks[np.arange(N), y]
original_hits = actual_rank < 32
cats = groups*2 + (ranks >= 32)
actual_cats = cats[np.arange(N), y]
exposures = np.array([np.bincount(c, minlength=6) for c in cats])
actual_groups = groups[np.arange(N), y]
experts = ['original', 'adaptive', 'smooth', 'learned', 'balanced']
expert_hits = np.array([[r['actual'] in r['expert_picks'][m] for m in experts] for r in R])

# Contexts use ONLY outcomes already known before the target. Include the current
# unlabeled state when exported; its placeholder outcome is not used below.
stage, numbers = [], []
for i, row in enumerate(R):
    t = row['t']; f = F[i]; g = groups[i]
    parts = []
    expected = np.array([(6/7)**k/7 for k in range(6)] + [(6/7)**6-(6/7)**11, (6/7)**11])
    parts.extend((np.bincount(f[:,4].astype(int),minlength=8)/49 - expected)*4)
    parts.extend(np.bincount(g[ranks[i]<32],minlength=3)/32 - np.bincount(g,minlength=3)/49)
    for window in [5,20,50]:
        past = np.arange(max(0,i-window),i)
        count = max(1,len(past))
        hits = np.bincount(actual_groups[past], minlength=3)
        pool = np.array([(groups[past]==k).sum() for k in range(3)])
        # Ratios remove the changing number of candidates in a category.
        parts.extend(np.log((hits+1)/(pool+49)*49)/2)
        parts.extend(hits/count - np.array([1-(6/7)**2, (6/7)**2-(6/7)**6, (6/7)**6]))
        parts.append((original_hits[past].mean() if len(past) else 32/49)-32/49)
    for lag in [1,2,3]:
        parts.extend((np.eye(3)[actual_groups[i-lag]]-1/3)/2 if i>=lag else np.zeros(3))
    stage.append(unit(parts))
    freq = np.bincount(H[max(0,t-20):t].ravel(),minlength=49)
    special = np.bincount(H[max(0,t-40):t,6],minlength=49)
    # Equal block norm prevents a dense block dominating sparse identity features.
    blocks = [np.log1p(np.minimum(f[:,0],40)), np.minimum(f[:,1],3),
              ranks[i]/48, freq, special]
    for lag in [1,2]:
        blocks.append(np.isin(ids,H[t-lag]).astype(float))
    numbers.append(unit(np.concatenate([unit(b-np.mean(b)) for b in blocks])))
X = {'stage':np.array(stage), 'numbers':np.array(numbers)}
np.savez_compressed(output/'contexts.npz', **X)
results=[]; detail=[]; neighbor_store={}; router_choices=[]
for i,row in enumerate(R):
    pred={'original':orders[i,:32]}; chosen_experts={}
    # Reproduce the previously explored overlap-only reference (numeric tie order).
    t=row['t']; previous=np.arange(2,t)
    similarity=np.array([len(set(H[k-1])&set(H[t-1]))+.5*len(set(H[k-2])&set(H[t-2])) for k in previous])
    nearest=previous[np.lexsort((-previous,-similarity))[:60]]
    pred['overlap_reference']=np.argsort(-np.bincount(H[nearest,6],minlength=49),kind='stable')[:32]
    candidate=np.arange(40,i)
    for family in X:
        sims=X[family][candidate]@X[family][i] if len(candidate) else np.array([])
        ordered=candidate[np.lexsort((-candidate,-sims))] if len(candidate) else candidate
        for k in [40,80]:
            near=ordered[:k]
            weights=np.exp((X[family][near]@X[family][i] - (X[family][near[0]]@X[family][i]))/.15) if len(near) else np.array([])
            if len(weights): weights*=len(weights)/weights.sum()
            performance=(weights@expert_hits[near]+20*32/49)/(weights.sum()+20)
            best=int(np.argmax(performance)) if len(candidate)>=80 else 0
            if performance[best] < performance[0]+.03: best=0
            router=f'router_{family}_{k}'; chosen_experts[router]=experts[best]
            pred[router]=np.array(row['expert_picks'][experts[best]])-1
            if i == N-1:
                neighbor_store[f'{family}_{k}']=[{'year':R[j]['year'],'No':R[j]['No'],'cosine':float(X[family][j]@X[family][i]),'weight':float(w),'special':int(y[j]+1),'rank':int(actual_rank[j]+1),'group':int(actual_groups[j])} for j,w in zip(near,weights)]
            scores={}
            scores['number']=np.bincount(y[near],weights=weights,minlength=49)+1
            counts=np.bincount(actual_rank[near]//7,weights=weights,minlength=7)
            scores['rank']=(counts+7)[ranks[i]//7]
            successes=np.bincount(actual_cats[near],weights=weights,minlength=6)
            pool=weights@exposures[near] if len(near) else np.zeros(6)
            scores['category']=((successes+2)/(pool+98))[cats[i]]
            for label in scores:
                name=f'{family}_{label}_{k}'
                pred[name]=rank_order(scores[label],ranks[i]) if len(candidate)>=80 else orders[i,:32]
    # Outcome read after generating all predictions for this target.
    results.append({'year':row['year'],'No':row['No'],'hits':{m:bool(y[i] in p) for m,p in pred.items()}})
    detail.append({m:[int(n+1) for n in p] for m,p in pred.items()}); router_choices.append(chosen_experts)

# A final unlabeled context is optional. It participates in prediction, not scoring.
scored = N-1 if R[-1].get('unlabeled') else N
all_models=list(results[0]['hits'])
dev1=[i for i in range(scored) if R[i]['year']==2025]
dev2=[i for i in range(scored) if R[i]['year']==2026 and R[i]['No']<=175]
def hits(m,idx): return sum(results[i]['hits'][m] for i in idx)
def key(m): return (-min(hits(m,dev1)/len(dev1),hits(m,dev2)/len(dev2)),-hits(m,dev1)-hits(m,dev2),(['original',*models]).index(m))
selected=sorted(models,key=key)[0]
selected_with_baseline=sorted(['original',*models],key=key)[0]
def paired(m,idx):
    gain=sum(results[i]['hits'][m] and not results[i]['hits']['original'] for i in idx)
    loss=sum(not results[i]['hits'][m] and results[i]['hits']['original'] for i in idx)
    discord=gain+loss
    p=min(1.,2*sum(math.comb(discord,j) for j in range(min(gain,loss)+1))/2**discord) if discord else 1.
    return {'hits':hits(m,idx),'gains':gain,'losses':loss,'net':gain-loss,'paired_p_two_sided_unadjusted':p}
windows={'2025':dev1,'2026_1_175':dev2,
 '176_225':[i for i in range(scored) if R[i]['year']==2026 and 176<=R[i]['No']<=225],
 '226_255':[i for i in range(scored) if R[i]['year']==2026 and 226<=R[i]['No']<=255],
 'last20':list(range(scored-20,scored)), 'last50':list(range(scored-50,scored)), 'last100':list(range(scored-100,scored))}
report={'protocol':protocol,'latest_scored':{k:R[scored-1][k] for k in ['year','No']}, 'selected_vector':selected,'selected_with_baseline':selected_with_baseline,
 'windows':{w:{'n':len(idx),'models':{m:paired(m,idx) for m in all_models}} for w,idx in windows.items()},
 'vector_dimensions':{f:int(v.shape[1]) for f,v in X.items()},
 'router_switches':{w:{m:sum(router_choices[i][m]!='original' for i in idx) for m in router_choices[0]} for w,idx in windows.items()},
 'current':{'router_experts':router_choices[-1], 'after':{k:D['history'][-1][k] for k in ['year','No']},'picks':detail[-1] if scored<N else None,'neighbors':neighbor_store if scored<N else None}}
(output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
(output/'rows.json').write_text(json.dumps([dict(r,picks=p) for r,p in zip(results[:scored],detail[:scored])]))
print('Selected vector:',selected,'including baseline:',selected_with_baseline)
for m in all_models:
    print(m, 'dev',hits(m,dev1),hits(m,dev2), '20/50/100',*[hits(m,windows[w]) for w in ['last20','last50','last100']])
