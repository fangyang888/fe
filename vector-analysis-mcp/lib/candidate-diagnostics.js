// Outcome-dependent diagnostics only. Never use these hindsight labels to select a forecast.
export function inspectCandidatePool(predictions, special, reference='vector') {
  const entries=Object.entries(predictions),sets=entries.map(([,picks])=>new Set(picks));
  const union=new Set(sets.flatMap(s=>[...s]));
  const common=[...sets[0]].filter(n=>sets.every(s=>s.has(n)));
  let overlap=0,pairs=0;
  for(let i=0;i<sets.length;i++)for(let j=i+1;j<sets.length;j++) {
    overlap+=[...sets[i]].filter(n=>sets[j].has(n)).length; pairs++;
  }
  const hitCandidates=entries.filter(([,picks])=>picks.includes(special)).map(([id])=>id);
  return {candidateCount:entries.length,uniqueForecasts:new Set(entries.map(([,picks])=>[...picks].sort((a,b)=>a-b).join(','))).size,
    commonNumberCount:common.length,unionNumberCount:union.size,meanPairOverlap:pairs?overlap/pairs:sets[0].size,
    anyCandidateHit:hitCandidates.length>0,referenceHit:predictions[reference].includes(special),hitCandidates};
}
export function summarizeCandidatePool(rows) {
  const count=rows.length,mean=field=>count?rows.reduce((s,r)=>s+r.pool[field],0)/count:null;
  return {count,meanUniqueForecasts:mean('uniqueForecasts'),meanCommonNumbers:mean('commonNumberCount'),
    meanUnionNumbers:mean('unionNumberCount'),meanPairOverlap:mean('meanPairOverlap'),
    referenceHits:rows.filter(r=>r.pool.referenceHit).length,
    hindsightAnyCandidateHits:rows.filter(r=>r.pool.anyCandidateHit).length,
    allCandidatesMissed:rows.filter(r=>!r.pool.anyCandidateHit).length,
    referenceMissButAnotherCandidateHit:rows.filter(r=>!r.pool.referenceHit&&r.pool.anyCandidateHit).length,
    blindSpots:rows.filter(r=>!r.pool.anyCandidateHit).map(r=>({year:r.year,No:r.No,special:r.special})),
    recoverableInHindsight:rows.filter(r=>!r.pool.referenceHit&&r.pool.anyCandidateHit).map(r=>({year:r.year,No:r.No,special:r.special,hitCandidates:r.pool.hitCandidates}))};
}
