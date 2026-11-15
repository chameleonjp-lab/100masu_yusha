import test from 'node:test';
import assert from 'node:assert/strict';
import { battleSpellCost } from '../src/engine/battle.js';
import {getContent,exampleRun,withScripts,startBattle} from './fixtures/helpers.mjs';
const base=await getContent();
test('spell cost rules distinguish attack spells from healing spells',()=>{
 const c=withScripts(base,{equipment:{SW01:{rules:[{hook:'spellCost',when:{eq:[{ref:'battle.spellKind'},'attack']},effects:[{op:'reduceCost',amount:1}]}]}}});
 const s=startBattle(c,exampleRun(c),'EN01').state;
 for(const kind of ['attack','heal']){
  const sp=Object.values(c.spells).find(x=>x.kind===kind&&x.mpCost>1);
  assert.ok(sp);
  assert.equal(battleSpellCost(c,s,sp.id),sp.mpCost-(kind==='attack'?1:0));
 }
});
