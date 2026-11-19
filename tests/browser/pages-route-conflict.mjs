// UI labels are from routes.*.name and actionLabel in the reviewed artifact.
import assert from 'node:assert/strict';
import {clickWithPhase} from './pages-settings.mjs';
export const ROUTES=['M','F','B','H'];
const names={M:'金貨の商人道',F:'職人の鍛冶道',B:'魔獣の討伐道',H:'灯火の巡礼道'};
export async function runRouteConflict({page,execute,route,key,wait=ms=>new Promise(r=>setTimeout(r,ms))}){
 assert.ok(ROUTES.includes(route),'Unsupported route');
 const card=page.getByRole('button',{name:new RegExp(names[route])});await card.waitFor();await clickWithPhase('choose-route',()=>card.click());
 await clickWithPhase('roll-die',()=>page.getByRole('button',{name:'サイコロを振る',exact:true}).click());
 const move=page.getByRole('button',{name:/そのまま.*マスへ/});await move.waitFor();
 // Load a separate, real session before the UI's committed move.
 const before=await execute(1,'conflictLoad',key);
 assert.equal(before.run.route,route);assert.equal(before.view.phase,'rolled');assert.ok(before.run.runId);
 await clickWithPhase('commit-move',()=>move.click());
 let winner;
 for(let attempt=0;attempt<100;attempt++){
  winner=await execute(0,'resume',key);
  if(winner.run?.revision!==before.run.revision)break;
  await wait(100);
 }
 assert.equal(winner.run.runId,before.run.runId);assert.equal(winner.run.revision,before.run.revision+1);assert.ok(winner.run.pos>before.run.pos);
 const persisted=await execute(0,'game',key);
 const conflict=await execute(1,'conflictMove',key);
 assert.deepEqual(conflict,{rejected:true,code:'stale_revision'});
 assert.deepEqual(await execute(0,'game',key),persisted,'Stale session altered winning run/meta');
 assert.deepEqual(await execute(1,'resume',key),winner,'Second connection did not read committed result');
 return {route,revision:winner.run.revision,position:winner.run.pos,phase:winner.view.phase,staleSessionRejected:true};
}
