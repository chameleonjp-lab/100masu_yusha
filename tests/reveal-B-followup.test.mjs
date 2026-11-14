import test from 'node:test';
import assert from 'node:assert/strict';
import { revealPreview } from '../src/engine/ops-basic.js';
import { exampleRun,getContent,place,withSquare } from './fixtures/helpers.mjs';
const c=await getContent();
test('bounded reveal includes optional battles and enemy names without changing state',()=>{
 let s=place(exampleRun(c,'B'),90);s=withSquare(s,91,'B3-30');s=withSquare(s,92,'B1-13');s=withSquare(s,93,'B1-01');
 const before=JSON.stringify(s);const all=revealPreview(c,s,{info:'allBattles',within:2,count:99});
 assert.deepEqual(all.squares.map(x=>x.pos),[91,92]);assert.equal(all.squares[0].enemyId,'MB01');assert.ok(all.squares[0].enemyName);
 const normal=revealPreview(c,s,{info:'allBattles',within:2,count:99,normalOnly:true});assert.deepEqual(normal.squares.map(x=>x.pos),[92]);assert.equal(JSON.stringify(s),before);
 const gold=revealPreview(c,s,{info:'nextGold'});assert.equal(gold.squares[0].pos,93);assert.equal(gold.squares[0].directGold,100);
});
test('reveal empty result is explicit, no candidate or position is invented',()=>{
 const s=place(exampleRun(c,'B'),99);for(const info of ['nextGold','nextInn','allBattles','gearCandidates','battleHint'])assert.deepEqual(revealPreview(c,s,{info}),{squares:[],none:true});
});
test('gear candidate preview preserves authored eligibility text rather than inventing future die',()=>{
 let s=place(exampleRun(c,'B'),90);s=withSquare(s,91,'B5-09');
 const v=revealPreview(c,s,{info:'gearCandidates'}).squares[0];assert.deepEqual(v.candidates.map(x=>x.id),['AR43','AR44','AR45']);assert.equal(v.conditions,c.events['B5-09'].action);
});
