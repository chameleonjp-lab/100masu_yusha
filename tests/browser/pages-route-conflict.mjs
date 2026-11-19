// UI labels are from routes.*.name and actionLabel in the reviewed artifact.
import assert from 'node:assert/strict';
import {clickWithPhase} from './pages-settings.mjs';
export const ROUTES=['M','F','B','H'];
const names={M:'金貨の商人道',F:'職人の鍛冶道',B:'魔獣の討伐道',H:'灯火の巡礼道'};
const observe=process.env.YUSHA_OBSERVE_UI_PHASE==='1';
export function moveFailureKind(error){
 const msg=typeof error?.message==='string'?error.message:'';
 if (/strict mode violation/i.test(msg))return 'ambiguous';
 if (/intercepts pointer events/i.test(msg))return 'pointer-intercept';
 if (/element is not enabled/i.test(msg))return 'disabled';
 if (/element is not visible/i.test(msg))return 'not-visible';
 if (/element is not stable/i.test(msg))return 'unstable';
 if (/element was detached|not attached to the DOM/i.test(msg))return 'detached';
 if (/outside of the viewport/i.test(msg))return 'outside-viewport';
 if (/Target page, context or browser has been closed/i.test(msg))return 'target-closed';
 if (error?.name==='TimeoutError')return 'timeout';
 return 'other';
}
async function observeMoveFailure(move,error){
 let snapshot='unavailable',timer;
 try{
  snapshot=await Promise.race([move.evaluateAll(elements=>{
   const app=document.querySelector('#app');
   const button=elements.length===1?elements[0]:null;
   const box=button?.getBoundingClientRect();
   const visible=!!box&&box.width>0&&box.height>0&&getComputedStyle(button).visibility==='visible';
   const inView=visible&&box.right>0&&box.bottom>0&&box.left<innerWidth&&box.top<innerHeight;
   const hit=inView?document.elementFromPoint(
    (Math.max(0,box.left)+Math.min(innerWidth,box.right))/2,
    (Math.max(0,box.top)+Math.min(innerHeight,box.bottom))/2):null;
   return [
    elements.length===0?'missing':elements.length===1?'unique':'multiple',
    button?.matches(':disabled,[aria-disabled="true"]')?'1':'0',
    visible?'1':'0',inView?'1':'0',hit&&button.contains(hit)?'1':'0',
    app?.hasAttribute('data-presentation')?'1':'0',
    app?.querySelector('[role="alert"]')?'1':'0',
    document.hidden?'1':'0'
   ].join(':');
  },undefined),new Promise(resolve=>{timer=setTimeout(()=>resolve('unavailable'),1000);})]);
 }catch{/* Diagnostic failure must not replace the original click failure. */}
 finally{clearTimeout(timer);}
 if(typeof snapshot!=='string'||! /^(?:missing|unique|multiple)(?::[01]){7}$/.test(snapshot))snapshot='unavailable';
 process.stderr.write(`YUSHA_FIXED_MOVE_FAILURE ${moveFailureKind(error)} ${snapshot}\n`);
}

export async function runRouteConflict({page,execute,route,key,wait=ms=>new Promise(r=>setTimeout(r,ms))}){
 assert.ok(ROUTES.includes(route),'Unsupported route');
 const card=page.getByRole('button',{name:new RegExp(names[route])});await card.waitFor();await clickWithPhase('choose-route',()=>card.click());
 await clickWithPhase('roll-die',()=>page.getByRole('button',{name:'サイコロを振る',exact:true}).click());
 const move=page.getByRole('button',{name:/そのまま.*マスへ/});await move.waitFor();
 // Load a separate, real session before the UI's committed move.
 const before=await execute(1,'conflictLoad',key);
 assert.equal(before.run.route,route);assert.equal(before.view.phase,'rolled');assert.ok(before.run.runId);
 try{await clickWithPhase('commit-move',()=>move.click());}
 catch(error){if(observe)try{await observeMoveFailure(move,error);}catch{}throw error;}
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
