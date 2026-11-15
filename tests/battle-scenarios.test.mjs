import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch } from '../src/engine/index.js';
import { exampleRun, getContent, landOnEvent, withScripts } from './fixtures/helpers.mjs';
const content=await getContent();
function setup(scenario){const c=withScripts(content,{events:{'B1-14':{onLand:[{op:'battle',enemy:'EN01',scenario}]}}});return {c,s:landOnEvent(c,exampleRun(c,'B'),'B1-14',{pos:10,die:5,patch:{hp:40}}).state};}
const first={eq:[{ref:'battle.round'},1]};
const scenario={attackChoices:[{id:'buckle',label:'留め金',when:first,damageMode:'none',effects:[{op:'setBattleFlag',key:'buckle',value:true}]},{id:'body',label:'本体',when:first,damageMode:'normal'}]};
test('scenario choice is required on its active turn; unknown choice is rejected atomically',()=>{
 const {c,s}=setup(scenario);const before=JSON.stringify(s);
 assert.throws(()=>dispatch(c,s,{type:'attack'}),/scenario_choice_required/);
 assert.throws(()=>dispatch(c,s,{type:'attack',choiceId:'unknown'}),/bad_scenario_choice/);
 assert.equal(JSON.stringify(s),before);
});
test('none attacks do not hit or consume die boost, and scenario flags survive save/reload',()=>{
 const {c,s}=setup(scenario),initial=s.battle.enemy.hp;
 const a=dispatch(c,s,{type:'attack',choiceId:'buckle'}).state;
 assert.equal(a.battle.enemy.hp,initial);assert.equal(a.battle.rounds[0].landed,false);
 assert.equal(a.battle.dieBonus.used,false);assert.equal(a.battle.flags['scenario:buckle'],true);
 const resumed=JSON.parse(JSON.stringify(a));
 const b=dispatch(c,resumed,{type:'attack'}).state;
 assert.ok(b.battle.enemy.hp<initial);assert.equal(b.battle.dieBonus.used,true);
 assert.equal(b.battle.flags['scenario:buckle'],true);
 assert.throws(()=>dispatch(c,a,{type:'attack',choiceId:'buckle'}),/bad_scenario_choice/);
});
test('normal choice preserves ordinary attack damage and attack history',()=>{
 const {c,s}=setup(scenario);
 const a=dispatch(c,s,{type:'attack',choiceId:'body'}).state;
 assert.equal(a.battle.rounds[0].action.type,'attack');assert.equal(a.battle.rounds[0].action.choiceId,'body');assert.equal(a.battle.rounds[0].landed,true);assert.equal(a.battle.dieBonus.used,true);
});
test('guard choices remain guard actions and can set only battle-scoped flags',()=>{
 const {c,s}=setup({guardChoices:[{id:'reeds',label:'穂の側',when:first,effects:[{op:'setBattleFlag',key:'reeds',value:true}]}]});
 const a=dispatch(c,s,{type:'guard',choiceId:'reeds'}).state;
 assert.equal(a.battle.rounds[0].guarded,true);assert.equal(a.battle.rounds[0].action.type,'guard');assert.equal(a.battle.flags['scenario:reeds'],true);assert.equal(a.flags?.reeds,undefined);
});

test('scenario round action is battle-local, survives reload and returns to enemy table',()=>{
 const {c,s}=setup({roundActions:[{round:1,action:{name:'目を覚ます',tell:'鈴に気づいた',kind:'準備',attack:0}}]});
 assert.equal(s.battle.current.name,'目を覚ます');assert.equal(s.battle.current.attack,0);
 const a=dispatch(c,JSON.parse(JSON.stringify(s)),{type:'guard'}).state;
 assert.equal(a.hp,40);assert.notEqual(a.battle.current.name,'目を覚ます');
 assert.notEqual(c.enemies.EN01.phases[0].actions[0].name,'目を覚ます');
});
test('scenario round healing is capped and only occurs if the enemy remains alive',()=>{
 const {c,s}=setup({roundActions:[{round:1,action:{name:'芋を食べる',tell:'芋を持つ',kind:'回復',attack:0,heal:4}}]});
 const initial=s.battle.enemy.hp;s.battle.enemy.hp-=6;
 const a=dispatch(c,s,{type:'guard'}).state;
 assert.equal(a.battle.enemy.hp,initial-2);assert.equal(a.battle.rounds[0].enemyHealed,4);assert.equal(a.hp,40);
});
test('normal scenario choice bonus changes just that strike',()=>{
 const {c,s}=setup({attackChoices:[{id:'real',label:'足跡',when:first,damageMode:'normal',bonus:2}]});
 const plain=setup({});const a=dispatch(c,s,{type:'attack',choiceId:'real'}).state,b=dispatch(plain.c,plain.s,{type:'attack'}).state;
 assert.equal(a.battle.enemy.hp,b.battle.enemy.hp-2);
});
test('scenario two-hit action resolves both hits and records their combined actual loss',()=>{
 const {c,s}=setup({roundActions:[{round:1,action:{name:'二段突き',kind:'通常攻撃',attack:1,rawDamage:2,hits:2}}]});
 const a=dispatch(c,s,{type:'attack'}).state;
 assert.equal(a.hp,36);assert.equal(a.battle.rounds[0].hpLost,4);
});
test('an attack choice can replace the current enemy action without changing future turns',()=>{
 const {c,s}=setup({attackChoices:[{id:'flute',label:'笛',when:first,damageMode:'none',effects:[{op:'setEnemyAction',action:{name:'笛が壊れた',attack:0,kind:'失敗',tell:'笛は鳴らない。'}}]}]});
 const a=dispatch(c,s,{type:'attack',choiceId:'flute'}).state;
 assert.equal(a.hp,40);assert.equal(a.battle.rounds[0].enemyAction.name,'笛が壊れた');assert.notEqual(a.battle.current.name,'笛が壊れた');
});
test('lethal enemy hit reports actual lost HP separately from potential damage',()=>{
 const {c,s}=setup({roundActions:[{round:1,action:{attack:1,rawDamage:99}}]});s.hp=3;
 const result=dispatch(c,s,{type:'attack'});const hit=result.effects.find(e=>e.t==='hit'&&e.target==='hero');
 assert.equal(hit.amount,3);assert.equal(hit.potentialDamage,99);
});
test('enemyHeal hook sees only missing HP, preventing phantom pool consumption',()=>{
 const {c,s}=setup({roundActions:[{round:1,action:{attack:0,heal:20}}]});
 s.battle.enemy.hp-=2;
 s.battle.marks.push({mid:900,owner:'fixture',createdRound:1,id:'heal-block',hook:'enemyHeal',when:null,stage:'gear',effects:[{op:'absorbDamage',amount:12}],uses:null,limit:null,enemyActionsLeft:null,heroTurnsLeft:null,fired:0});
 const a=dispatch(c,s,{type:'guard'}).state;
 assert.equal(a.battle.rounds[0].enemyHealed,0);
 assert.equal(a.battle.marks.find(m=>m.id==='heal-block').pool,10);
});
test('scenario threshold announcement occurs once when HP first reaches half',()=>{
 const {c,s}=setup({announcements:[{id:'potato',once:true,when:{lte:[{mul:[{ref:'battle.enemyHp'},2]},{ref:'battle.enemyMaxHp'}]},action:{name:'芋を食べる',kind:'回復',attack:0,heal:4}}]});
 s.battle.enemy.hp=Math.floor(s.battle.enemy.maxHp/2);
 const a=dispatch(c,s,{type:'guard'}).state;
 assert.equal(a.battle.current.scenarioId,'potato');
 const b=dispatch(c,a,{type:'guard'}).state;
 assert.notEqual(b.battle.current.scenarioId,'potato');
});
test('piercing choice ignores announced defense while keeping normal attack history',()=>{
 const {c,s}=setup({attackChoices:[{id:'pierce',label:'防御を無視',when:first,damageMode:'pierce'}]});
 const plain=setup({});const a=dispatch(c,s,{type:'attack',choiceId:'pierce'}).state,b=dispatch(plain.c,plain.s,{type:'attack'}).state;
 assert.equal(a.battle.rounds[0].dealt,b.battle.rounds[0].dealt+s.battle.current.defense);
});
test('landing recovery is discarded on defeat before retry can restore the battle',()=>{
 const {c,s}=setup({roundActions:[{round:1,action:{rawDamage:99,hits:1}}]});
 s.flags.bd37={remaining:0,kinds:['battle'],settlePos:s.pos};
 const out=dispatch(c,s,{type:'guard'}).state;
 assert.equal(out.battle.result,'loss');assert.equal(out.flags.bd37,undefined);
});
test('item guard preserves item history and counts as a guard for downstream rules',async()=>{
 const {evalExpr}=await import('../src/engine/expr.js');
 const c=withScripts(content,{items:{AT23:{uses:[{where:['battle'],effects:[{op:'assumeGuard'}]}]}}});
 let s=landOnEvent(c,exampleRun(c,'B'),'B1-14',{pos:10,die:5,patch:{hp:40,bag:['AT23']}}).state;
 s=dispatch(c,s,{type:'item',itemId:'AT23'}).state;
 const env={ctx:{content:c,s}};assert.equal(s.battle.rounds[0].action.type,'item');assert.equal(s.battle.rounds[0].guarded,true);
 assert.equal(evalExpr(env,{ref:'battle.heroAction',abs:1}),'guard');
 for(const what of ['guards','items','distinctItems'])assert.equal(evalExpr(env,{ref:'battle.count',what}),1);
});
test('all-source enemy HP hooks cover companion/reflection-style damage without double application',()=>{
 const c=withScripts(content,{events:{'B1-14':{onLand:[{op:'battle',enemy:'EN01',rules:[{id:'shield',hook:'enemyHpDamage',effects:[{op:'subDamage',amount:2}]},{id:'observe',hook:'enemyHpLost',effects:[{op:'setBattleFlag',key:'lost',value:{ref:'battle.dealt'}}]},{id:'counter',hook:'afterEnemyAction',effects:[{op:'dealDamage',amount:6}]}]}]}}});
 const s=landOnEvent(c,exampleRun(c,'B'),'B1-14',{pos:10,die:5,patch:{hp:40}}).state;
 const out=dispatch(c,s,{type:'guard'}).state;
 assert.equal(out.battle.enemy.hp,s.battle.enemy.hp-4);assert.equal(out.battle.flags['scenario:lost'],4);
});
test('battle action preview includes damage rules and does not mutate RNG/state/marks',async()=>{
 const {battleActionPreview}=await import('../src/engine/battle.js');
 const c=withScripts(content,{events:{'B1-14':{onLand:[{op:'battle',enemy:'EN01',rules:[{id:'plus',hook:'enemyDamage',effects:[{op:'addDamage',amount:3}]}]}]}}});
 const s=landOnEvent(c,exampleRun(c,'B'),'B1-14',{pos:10,die:5,patch:{hp:40}}).state,before=JSON.stringify(s);
 const preview=battleActionPreview(c,s,{type:'guard'});const result=dispatch(c,s,{type:'guard'});
 assert.equal(preview.available,true);assert.equal(preview.damage,result.effects.filter(x=>x.t==='hit'&&x.target==='hero').reduce((n,x)=>n+x.amount,0));
 assert.equal(JSON.stringify(s),before);assert.deepEqual(battleActionPreview(c,s,{type:'guard'}),preview);
});
