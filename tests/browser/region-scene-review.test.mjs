// Independent regression: execute the real scene factory, not the bridge's render stub.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {mountCastleBackground} from '../../src/ui/castle-background-dom.js';
const source=fs.readFileSync(process.env.APP_SOURCE||new URL('../../src/ui/app.js',import.meta.url),'utf8');
const sceneSource=source.slice(source.indexOf('function scene(v,home=false)'),source.indexOf('\nfunction render('));
function inspect(pos=99,{phase='board',osReduced=false,savedReduced=false}={}){
 const updates=[],ribbons=[];
 const node=()=>({style:{},classList:{add(){},remove(){}},append(){},setAttribute(){},querySelector(){return null}});
 const context={mountCastleBackground,castleImages:{load(){throw Error('unexpected asset request before stage update')}},document:{createElement:node,createElementNS:node},lastAction:'',animated:()=>false,reduced:{matches:osReduced},session:{meta:{settings:{reducedMotion:savedReduced}}},el:(tag,cls,text)=>{if(cls==='scene-ribbon')ribbons.push(text);return node()},msg:()=>'',tr:key=>({'ui.region.bands.5.name':'Castle Town and Outer Moat'})[key],add(){},art:node,project:()=>({x:0,y:0}),createStage:()=>({update:x=>updates.push(x)}),requestAnimationFrame:fn=>fn(),presentation:{running:false},stage:null};
 vm.createContext(context);vm.runInContext(sceneSource,context);
 context.v={pos,phase,hero:{job:{id:'JB00'},companions:[]},board:{band:{id:5,name:'城下と外堀'}}};vm.runInContext('scene(v)',context);
 return {updates,ribbons};
}
test('persistent scene ribbon uses the selected translated region name after presentation ends',()=>{
 assert.deepEqual(inspect().ribbons,['Castle Town and Outer Moat']);
});
for(const pos of [95,96,97,98,99])test(`final scene preserves position ${pos} for castle scale`,()=>{
 const {updates}=inspect(pos);assert.equal(updates.length,1);assert.equal(updates[0].band,5);assert.equal(updates[0].pos,pos);
});

for(const [osReduced,savedReduced] of [[false,false],[true,false],[false,true]])test(`gate phase and motion reach stage (OS=${osReduced}, saved=${savedReduced})`,()=>{
 const {updates}=inspect(100,{phase:'gate',osReduced,savedReduced});
 assert.equal(updates.length,1);assert.equal(updates[0].pos,100);assert.equal(updates[0].phase,'gate');
 assert.equal(updates[0].reducedMotion,osReduced||savedReduced);
});
test('a non-gate scene at 100 retains its separate phase',()=>{
 const {updates}=inspect(100,{phase:'finished'});
 assert.equal(updates.length,1);assert.equal(updates[0].phase,'finished');
});
