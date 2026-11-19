// Local probe candidate. Callers must provide an isolated, seeded context and a
// separately verified exact preview. This module never starts a browser/server.
import assert from 'node:assert/strict';
export async function runBattleProbe({page,readSnapshot,reload,wait=ms=>new Promise(r=>setTimeout(r,ms))}){
 const enabled=async(c)=>{await c.waitFor({timeout:10000});for(let i=0;i<100;i++){if(await c.isEnabled())return;await wait(100);}assert.fail('Control enabled timeout');};
 const click=async(name)=>{const c=page.getByRole('button',{name,exact:typeof name==='string'});await enabled(c);await c.click();};
 let id;const identity=s=>{assert.equal(s.status,'ok','Saved state not readable');assert.equal(s.run?.seed,31);assert.equal(s.run?.route,'B');assert.ok(s.run?.runId);if(id)assert.equal(s.run.runId,id,'Changed run');assert.equal(s.view?.runId,s.run.runId);assert.equal(s.view?.revision,s.run.revision);};
 const committed=async(revision)=>{let s;for(let i=0;i<100;i++){s=await readSnapshot();if(s.run){identity(s);if(s.run.revision===revision)return s;}assert.ok(!s.run||s.run.revision<revision,'Unexpected extra commit');await wait(100);}assert.fail('Commit timeout');};
 const initial=await readSnapshot();assert.equal(initial.status,'empty','Isolated empty save required');assert.equal(initial.run,null,'Existing run must not be replaced');
 await click(/魔獣の討伐道/);const start=await committed(0);assert.equal(start.run.seed,31);assert.equal(start.run.route,'B');assert.equal(start.view.phase,'board');
 id=start.run.runId;assert.ok(id);
 await click('サイコロを振る');const rolled=await committed(1);assert.equal(rolled.view.phase,'rolled');
 await click(/そのまま.*マスへ/);const battle=await committed(2);assert.equal(battle.run.runId,id);assert.equal(battle.run.pos,3);assert.equal(battle.view.phase,'battle');assert.equal(battle.view.battle.kind,'normal');assert.equal(battle.view.battle.enemy.id,'EN01');assert.equal(battle.view.battle.enemy.hp,15);assert.ok(battle.view.actions.some(a=>a.type==='attack'&&a.enabled));
 await click('剣で攻撃');const saved=await committed(3);assert.equal(saved.run.runId,id);assert.equal(saved.run.pos,3);assert.equal(saved.view.phase,'battle');assert.equal(saved.view.hero.hp,39);assert.equal(saved.view.battle.enemy.hp,10);
 assert.deepEqual(await readSnapshot(),saved,'Snapshot changed before reload');await reload();assert.deepEqual(await readSnapshot(),saved,'Snapshot changed on reload');
 await click('3マスから続きを遊ぶ');await page.getByRole('heading',{level:1,name:'3 / 100',exact:true}).waitFor();
 const attack=page.getByRole('button',{name:'剣で攻撃',exact:true});await enabled(attack);assert.deepEqual(await readSnapshot(),saved,'Continue changed saved state');
 return{seed:31,position:3,revision:3,heroHp:39,enemyHp:10,runId:id,savedSnapshotUnchanged:true,nativeBrowser:false,evidence:'Caller-supplied page boundary; native evidence must be recorded separately'};
}
