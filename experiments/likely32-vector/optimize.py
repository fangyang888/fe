"""Second, fixed hypothesis batch: decorrelate neighbors and gate realized swaps.
Usage: python optimize.py INPUT.json PREVIOUS_RESULTS OUTPUT_DIRECTORY
The earlier batch supplies causal vectors and an overlap-only reference.
All gates are updated only after the target outcome is revealed.
"""
import hashlib, json, math, sys
from pathlib import Path
import numpy as np

FAMILIES = ['stage', 'numbers', 'hybrid']
MODES = ['dense_repair', 'spaced_repair', 'guarded_repair', 'paired_router']
MODELS = [f'{family}_{mode}' for family in FAMILIES for mode in MODES] + ['online_selector']
PROTOCOL = {
    'version': 'vector-opt-v1', 'candidates': MODELS,
    'neighbors': '40 cosine neighbors; spaced variants exclude last 5 states and require >=5 periods between neighbors; fixed temperature 0.15',
    'hybrid': 'equal weight for unit-length stage and number context vectors',
    'repair': 'uniform 49-count prior; at most 4 swaps; per-number smoothed score difference >=0.003',
    'guard': 'counterfactual repair-minus-original outcomes, half-life 30; switch if mean net gain >0.75 standard errors; effective mass >=40',
    'router': 'original plus four existing lab variants and overlap reference; same-neighbor paired gain; 20-count zero-gain prior; mean >0.75 standard errors; effective neighbors >=20',
    'online_selector': '12 candidates; prior actual causal outcomes, half-life 50; mean gain minus one standard error >0; mass >=40; otherwise original',
    'warmup': 'original until at least 80 eligible historical contexts, all contexts start at 50 draws',
    'selection': 'maximize minimum coverage in 2025 and 2026 1..175; tie pooled hits then candidate order; original included',
    'evaluation': 'all data through 2026-275 has been explored; NOT pristine out-of-sample evidence',
    'constraints': '32 unique picks every issue; labels used only after forecast; no skipped issues',
}

def diverse(ordered, k=40, gap=5):
    selected=[]
    for index in ordered:
        if all(abs(int(index)-int(j))>=gap for j in selected): selected.append(index)
        if len(selected)==k: break
    return np.array(selected,dtype=int)

class Evidence:
    def __init__(self, size, half):
        self.total=np.zeros(size); self.square=np.zeros(size)
        self.mass=0.; self.sqmass=0.; self.decay=.5**(1/half)
    def bounds(self, penalty):
        if self.mass<40: return np.full(len(self.total),-np.inf)
        mean=self.total/self.mass
        variance=np.maximum(0.,self.square/self.mass-mean*mean)
        effective=self.mass*self.mass/self.sqmass
        return mean-penalty*np.sqrt(variance/effective)
    def update(self, delta):
        delta=np.asarray(delta,dtype=float)
        self.total=self.total*self.decay+delta
        self.square=self.square*self.decay+delta*delta
        self.mass=self.mass*self.decay+1
        self.sqmass=self.sqmass*self.decay*self.decay+1

def run(data, contexts, previous):
    rows=data['rows']; count=len(rows)
    f=np.array([r['features'] for r in rows]); order=np.argsort(-f[:,:,2],axis=1,kind='stable')
    rank=np.argsort(order,axis=1,kind='stable'); actual=np.array([r['actual']-1 for r in rows])
    expert_names=['original','adaptive','smooth','learned','balanced','overlap_reference']
    expert_picks=[{**{k:np.array(v)-1 for k,v in r['expert_picks'].items()},'overlap_reference':np.array(p['overlap_reference'])-1} for r,p in zip(rows,previous)]
    expert_hit=np.array([[actual[i] in picks[k] for k in expert_names] for i,picks in enumerate(expert_picks)],dtype=float)
    vectors={**contexts,'hybrid':np.concatenate([contexts['stage'],contexts['numbers']],axis=1)/math.sqrt(2)}
    guard=Evidence(3,30); selector=Evidence(12,50)
    forecasts=[]; outcomes=[]; current=None
    for i,row in enumerate(rows):
        original=order[i,:32]; pred={'original':original, 'overlap_reference':expert_picks[i]['overlap_reference']}
        raw_repairs=[]; explanations={}
        selector_bounds=selector.bounds(1.)
        guard_bounds=guard.bounds(.75)
        for family_no,family in enumerate(FAMILIES):
            eligible=np.arange(40,i)
            similarity=vectors[family][eligible]@vectors[family][i] if len(eligible) else np.array([])
            sorted_neighbors=eligible[np.lexsort((-eligible,-similarity))]
            spaced=diverse(sorted_neighbors[sorted_neighbors<=i-5])
            for dense,near in [(True,sorted_neighbors[:40]),(False,spaced)]:
                scores=vectors[family][near]@vectors[family][i] if len(near) else np.array([])
                weight=np.exp((scores-scores[0])/.15) if len(near) else np.array([])
                if len(near): weight*=len(near)/weight.sum()
                effective=float(weight.sum()**2/(weight@weight)) if len(near) else 0.
                counts=np.bincount(actual[near],weights=weight,minlength=49)
                number_score=(counts+1)/(len(near)+49)
                outgoing=sorted(original,key=lambda n:(number_score[n],-rank[i,n]))
                incoming=sorted(order[i,32:],key=lambda n:(-number_score[n],rank[i,n]))
                picks=original.copy(); swaps=[]
                if len(eligible)>=80:
                    for old,new in zip(outgoing[:4],incoming[:4]):
                        if number_score[new]-number_score[old]<.003: break
                        picks[np.flatnonzero(picks==old)[0]]=new
                        swaps.append({'out':int(old+1),'in':int(new+1),'score_advantage':float(number_score[new]-number_score[old])})
                mode='dense_repair' if dense else 'spaced_repair'
                pred[f'{family}_{mode}']=picks
                if not dense:
                    raw_repairs.append(picks)
                    pred[f'{family}_guarded_repair']=picks if guard_bounds[family_no]>0 else original
                    delta=expert_hit[near]-expert_hit[near,0,None]
                    mean=(weight@delta)/(len(near)+20)
                    variance=np.maximum(0., (weight@(delta*delta))/max(1,len(near))-(weight@delta/max(1,len(near)))**2)
                    lower=mean-.75*np.sqrt(variance/max(1,effective))
                    best=int(np.argmax(lower)) if effective>=20 and len(eligible)>=80 else 0
                    if lower[best]<=0: best=0
                    pred[f'{family}_paired_router']=expert_picks[i][expert_names[best]]
                    explanations[family]={'neighbors':[{'year':rows[j]['year'],'No':rows[j]['No'],'cosine':float(c),'special':int(actual[j]+1)} for j,c in zip(near,scores)],
                        'effective_neighbors':effective,'swaps':swaps,'guard_active':bool(guard_bounds[family_no]>0),
                        'router_choice':expert_names[best]}
        best=int(np.argmax(selector_bounds))
        chosen=MODELS[best] if selector_bounds[best]>0 else 'original'
        pred['online_selector']=pred[chosen]
        forecasts.append({m:[int(n+1) for n in picks] for m,picks in pred.items()})
        current={'explanations':explanations,'online_choice':chosen,'picks':forecasts[-1]}
        # All learning happens AFTER every forecast for this issue was frozen.
        if not row.get('unlabeled'):
            hits={m:bool(actual[i] in picks) for m,picks in pred.items()}
            outcomes.append({'year':row['year'],'No':row['No'],'hits':hits,'online_choice':chosen})
            original_hit=hits['original']
            guard.update([int(actual[i] in picks)-int(original_hit) for picks in raw_repairs])
            selector.update([int(hits[m])-int(original_hit) for m in MODELS[:-1]])
    return outcomes,forecasts,current

def summarize(data, outcomes, forecasts, current):
    n=len(outcomes); dev1=[i for i,r in enumerate(outcomes) if r['year']==2025]
    dev2=[i for i,r in enumerate(outcomes) if r['year']==2026 and r['No']<=175]
    windows={'2025':dev1,'2026_1_175':dev2, 'last20':list(range(n-20,n)), 'last50':list(range(n-50,n)), 'last100':list(range(n-100,n)),
             '176_225':[i for i,r in enumerate(outcomes) if r['year']==2026 and 176<=r['No']<=225],
             '226_255':[i for i,r in enumerate(outcomes) if r['year']==2026 and 226<=r['No']<=255]}
    def hits(m,idx): return sum(outcomes[i]['hits'][m] for i in idx)
    def stats(m,idx):
        gains=sum(outcomes[i]['hits'][m] and not outcomes[i]['hits']['original'] for i in idx)
        losses=sum(not outcomes[i]['hits'][m] and outcomes[i]['hits']['original'] for i in idx)
        return {'hits':hits(m,idx),'gains':gains,'losses':losses,'net':gains-losses,
                'changed_issues':sum(set(forecasts[i][m])!=set(forecasts[i]['original']) for i in idx)}
    selection=['original',*MODELS]
    selected=min(selection,key=lambda m:(-min(hits(m,dev1)/len(dev1),hits(m,dev2)/len(dev2)),-hits(m,dev1)-hits(m,dev2),selection.index(m)))
    return {'protocol':PROTOCOL,'latest_scored':{k:outcomes[-1][k] for k in ['year','No']},'selected':selected,
            'windows':{w:{'n':len(idx),'models':{m:stats(m,idx) for m in outcomes[0]['hits']}} for w,idx in windows.items()},
            'current':{'after':{k:data['history'][-1][k] for k in ['year','No']},**current}}

if __name__=='__main__':
    source, reference, output=map(Path,sys.argv[1:4]); output.mkdir(parents=True,exist_ok=True)
    data=json.loads(source.read_text()); old_report=json.loads((reference/'report.json').read_text())
    assert old_report['protocol']['input_sha256']==hashlib.sha256(source.read_bytes()).hexdigest(), 'Mismatched vector cache'
    old_rows=json.loads((reference/'rows.json').read_text())
    previous=[r['picks'] for r in old_rows]+[old_report['current']['picks']]
    vectors=dict(np.load(reference/'contexts.npz'))
    assert len(previous)==len(data['rows'])==len(vectors['stage'])==len(vectors['numbers'])
    (output/'protocol.json').write_text(json.dumps(PROTOCOL,ensure_ascii=False,indent=2))
    outcomes,forecasts,current=run(data,vectors,previous)
    report=summarize(data,outcomes,forecasts,current)
    (output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    (output/'rows.json').write_text(json.dumps([dict(r,picks=p) for r,p in zip(outcomes,forecasts)]))
    print('Selected before evaluation:',report['selected'])
    for m in outcomes[0]['hits']:
        print(m, *[f"{w}:{report['windows'][w]['models'][m]['hits']}" for w in ['2025','2026_1_175','last20','last50','last100']])
