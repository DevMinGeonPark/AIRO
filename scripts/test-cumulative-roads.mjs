import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { decodePolyline } from '../src/lib/polyline.ts';
const source=await readFile('src/lib/landing-journey.ts','utf8');
const javascript=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace('"./polyline"',JSON.stringify(pathToFileURL(process.cwd()+'/src/lib/polyline.ts').href));
const {planJourney,walkingDistance}=await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64'));
const base=JSON.parse(await readFile('public/maps/outing-scenarios.json','utf8')).cities;
const targets=JSON.parse(await readFile('public/maps/target-scenarios.json','utf8')).cities;
const key=p=>p.join(','); const edge=(a,b)=>[key(a),key(b)].sort().join('|');
const checks=[]; let edgesChecked=0,largestSnap=0;
for(const [city,original] of Object.entries(base)) {
 const scenario={...original,alternatives:[targets[city]]};
 const edges=new Set();
 for(const s of [original,targets[city]]) for(const route of [s.route,...Object.values(s.categories).flat().map(p=>p.route)]) for(const leg of route.legs) {const p=decodePolyline(leg);for(let i=1;i<p.length;i++) edges.add(edge(p[i-1],p[i]));}
 for(const target of [0,1]) {
  let saved=[],previous=null;
  const seen=new Set();
  for(const category of ['restaurant','cafe','bar','dessert','restaurant']) {
   const index=original.categories[category].findIndex(place=>!seen.has(place.id)); assert.ok(index>=0);
   saved.push({category,index});seen.add(original.categories[category][index].id);
   const plan=planJourney(scenario,target,saved);
   assert.equal(plan.stops.length,saved.length);
   if(previous) assert.deepEqual(plan.legs.slice(0,saved.length-1),previous.legs.slice(0,saved.length-1),'Existing visit legs stay unchanged');
   for(const leg of plan.legs) for(let i=1;i<leg.length;i++) {assert.ok(edges.has(edge(leg[i-1],leg[i])),city+' uses a recorded road edge');edgesChecked++;}
   for(let i=1;i<plan.legs.length;i++) assert.deepEqual(plan.legs[i-1].at(-1),plan.legs[i][0],city+' continuous junction');
   const places=[original.origin,...plan.stops,[original,targets[city]][target].destination];
   for(let i=0;i<plan.legs.length;i++) for(const [point,place] of [[plan.legs[i][0],places[i]],[plan.legs[i].at(-1),places[i+1]]]) {const meters=walkingDistance(point,place.coordinate);largestSnap=Math.max(largestSnap,meters);assert.ok(meters<250);}
   previous=plan;
  }
  const changed=planJourney(scenario,1-target,saved);
  assert.deepEqual(changed.legs.slice(0,saved.length),previous.legs.slice(0,saved.length),'Changing final destination preserves food/cafe visits');
  const duplicate=planJourney(scenario,target,[...saved,saved[0]]);
  assert.equal(duplicate.stops.length,saved.length,'Repeated place is not added again');
 }
 checks.push({city,targets:2,orderedStops:5,preservedPrefixes:true,changedDestinationPreservesStops:true});
}
await mkdir('assets/validation/city-stories',{recursive:true});
await writeFile('assets/validation/city-stories/roads.json',JSON.stringify({checks,edgesChecked,largestSnap},null,2));
console.log(`✓ ${checks.length} cities × 2 destinations: 5 ordered stops, preserved legs, duplicate prevention; ${edgesChecked} real-road edges checked, max snap ${largestSnap.toFixed(2)}m`);
