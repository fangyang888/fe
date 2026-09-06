const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const raw=JSON.parse(fs.readFileSync(path.join(__dirname,'history.json')));
const candidates=[{key:'L14-P1-A2-B15',lag:14,position:1,a:2,b:15},{key:'L100-P7-A48-B0',lag:100,position:7,a:48,b:0}];
const csv=['year,period,algorithm,sourceYear,sourcePeriod,sourcePosition,sourceNumber,unwrapped,predicted,actual,success'];
const output=[];
for(const c of candidates){const rows=[];for(let i=raw.length-200;i<raw.length;i++){
  const source=raw[i-c.lag],x=Number(source[`n${c.position}`]),unwrapped=c.a*x+c.b;
  // Independent wrap implementation, not modulo expression from search.cjs.
  let predicted=unwrapped;while(predicted>49)predicted-=49;while(predicted<1)predicted+=49;
  const r=raw[i],actual=Array.from({length:7},(_,j)=>Number(r[`n${j+1}`])),success=!actual.includes(predicted);
  rows.push({year:r.year,No:r.No,predicted,actual,success});
  csv.push([r.year,r.No,c.key,source.year,source.No,c.position,x,unwrapped,predicted,actual.join('|'),Number(success)].join(','));
}
const counts=Object.fromEntries([50,100,200].map(w=>[w,rows.slice(-w).filter(r=>r.success).length]));
assert.equal(counts[50],50);
const report=JSON.parse(fs.readFileSync(path.join(__dirname,'results.json'))).allLinear.find(r=>r.key===c.key);
for(const w of [50,100,200])assert.equal(counts[w],report[`last${w}`].success);
output.push({key:c.key,counts,failuresInLast200:rows.filter(r=>!r.success)});
}
fs.writeFileSync(path.join(__dirname,'perfect-formulas-audit.csv'),csv.join('\n'));
fs.writeFileSync(path.join(__dirname,'perfect-formulas-verification.json'),JSON.stringify(output,null,2));
console.log('Both formulas independently verified, including source row and 200-period failure records.');
