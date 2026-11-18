import {planKingTurn} from './king-turn-plan.js';
import {planKingSpellTimeline} from './king-spell-timeline.js';
import {appendKingRewardSequence} from './king-reward-sequence.js';
// Board timeline plus a visual-only normal-attack slice; battle is not connected to app/stage/audio/CSS.
// Contract: before/after are plain view snapshots around ONE successful session.act + readback.
// Effects are that act's returned array. Reload/start/failed or superseded commits must not replay.
// No game dispatch, randomness, storage, browser globals or clock calls belong in this planner.
const copy=value=>structuredClone(value);
function freeze(value){if(value&&typeof value==='object'){for(const x of Object.values(value))freeze(x);Object.freeze(value)}return value}
const soundPriority=cue=>{
 if(['victory','defeat','win.battle'].includes(cue))return 0;
 if(cue==='levelup')return 1;if(cue==='crown.crack')return 2;if(cue==='tell.big')return 3;if(cue==='shield')return 4;
 if(['slash','hit.party'].includes(cue))return 5;if(['heal','heal.full'].includes(cue))return 6;
 if(['coin.in','coin.pay'].includes(cue))return 7;if(['bag','sheath','buckle'].includes(cue))return 8;return 9;
};
// T5 connection contract only: do not play sounds here. Stable ties preserve original step order.
export function selectSkipSounds(steps,playedKeys=new Set()){
 const played=new Set(playedKeys);
 return steps.map((step,index)=>({step,index})).filter(({step})=>step.kind==='sound'&&step.payload.role==='committed'&&!played.has(step.key))
  .sort((a,b)=>soundPriority(a.step.payload.cue)-soundPriority(b.step.payload.cue)||a.index-b.index).slice(0,2)
  .map(({step},index)=>({...copy(step),atMs:index*120}));
}
// One completed, surviving, single-hit normal attack only. Read authoritative payloads;
// never derive damage/mitigation from attack, defense, die or the next telegraph.
function normalAttackTurn(before,after,effects){
 const b=before.battle,a=after.battle,nonnegative=n=>Number.isSafeInteger(n)&&n>=0;
 if(before.phase!=='battle'||after.phase!=='battle'||!b||!a||b.kind!=='normal'||a.kind!=='normal'||b.stage!=='fight'||a.stage!=='fight'||
  !Number.isSafeInteger(b.id)||b.id!==a.id||!Number.isSafeInteger(b.round)||b.round<1||a.round!==b.round+1||
  !b.enemy?.id||b.enemy.id!==a.enemy?.id||before.pos!==after.pos||!Array.isArray(a.history))return null;
 const complete=a.history.filter(r=>r?.round===b.round);
 if(complete.length!==1)return null;
 const rec=complete[0],action=rec.action;
 if(action?.type!=='attack'||action.choiceId!==undefined||action.targets!==undefined||action.target!=null)return null;
 // Additional battle mechanisms (multi-hit, healing, support, status/rule effects, etc.)
 // stay static until their own slice; they must not silently look like this simple turn.
 if(effects.some(e=>!['hit','enemyAct','dieSoften','enemyTell'].includes(e.t)))return null;
 const enemyHits=effects.filter(e=>e.t==='hit'&&e.target==='enemy'),heroHits=effects.filter(e=>e.t==='hit'&&e.target==='hero'),acts=effects.filter(e=>e.t==='enemyAct'),soften=effects.filter(e=>e.t==='dieSoften'),tells=effects.filter(e=>e.t==='enemyTell');
 if(enemyHits.length!==1||heroHits.length!==1||acts.length!==1||soften.length>1||tells.length>1||effects.filter(e=>e.t==='hit').length!==2)return null;
 const enemyHit=enemyHits[0],heroHit=heroHits[0],enemyAct=acts[0],index=e=>effects.indexOf(e);
 if(index(enemyHit)>=index(enemyAct)||index(enemyAct)>=index(heroHit)||
  soften.some(e=>index(e)<=index(enemyAct)||index(e)>=index(heroHit))||tells.some(e=>index(e)<=index(heroHit)))return null;
 if(enemyAct.round!==b.round||typeof enemyAct.name!=='string'||!enemyAct.name.trim()||enemyAct.name!==rec.enemy||
  typeof enemyAct.kind!=='string'||!enemyAct.kind.trim()||!nonnegative(enemyAct.attack)||heroHit.enemyKind!==enemyAct.kind)return null;
 for(const [hit,prior,next] of [[enemyHit,b.enemy,a.enemy],[heroHit,before.hero,after.hero]]){
  if(!prior||!next||!nonnegative(prior.hp)||!nonnegative(next.hp)||prior.hp===0||next.hp===0||
   !nonnegative(hit.amount)||!nonnegative(hit.hp)||!nonnegative(hit.maxHp)||hit.hp>hit.maxHp||
   hit.hp!==next.hp||prior.hp-hit.amount!==hit.hp||hit.maxHp!==prior.maxHp||hit.maxHp!==next.maxHp)return null;
 }
 if(enemyHit.amount===0||enemyHit.blocked!==undefined||heroHit.guarded!==false||
  !['base','blocked','potentialDamage'].every(k=>nonnegative(heroHit[k]))||heroHit.potentialDamage<heroHit.amount||
  soften.some(e=>!nonnegative(e.amount)||e.amount>heroHit.blocked)||rec.dealt!==enemyHit.amount||rec.hpLost!==heroHit.amount)return null;
 return {round:b.round,action,enemyAct,enemyHit,heroHit,soften};
}
// Nonpersistent opt-in: existing app callers remain board-only until the battle renderer is wired.
export function planPresentation({before,after,effects=[],settings={},battleVisual=false,kingVisual=false,kingTurnVisual=false,spellVisual=false,kingSpellTimeline=false,victoryVisual=false,kingRewardVisual=false,regionVisual=false,castleVisual=false}){
 const finalView=copy(after),steps=[];let time=0,resultEffects=[],parallelEnd=0;
 const result=()=>freeze({steps,durationMs:time,finalView,resultEffects});
 const kingResult=turn=>kingRewardVisual===true&&turn?.mode==='king-victory-turn'?(appendKingRewardSequence(turn,settings)??result()):(turn??result());
 // Not proof of persistence: the caller must supply only successfully committed pairs.
 if(!before||!after||before.runId!==after.runId||!Number.isSafeInteger(before.revision)||!Number.isSafeInteger(after.revision)||after.revision!==before.revision+1)return result();
 if(!Array.isArray(effects)||effects.some(e=>!e||typeof e!=='object'))return result();
 const starts=effects.filter(e=>e.t==='battleStart'),tells=effects.filter(e=>e.t==='enemyTell'),a=after.battle;
 const kingStart=kingVisual===true&&effects.every(e=>['discover','battleStart','enemyTell'].includes(e.t))&&tells.length===1&&tells[0].round===1&&tells[0].name===a?.telegraph?.name&&tells[0].kind===a?.telegraph?.kind&&before.phase==='gate'&&!before.battle&&before.pos===100&&after.pos===100&&after.phase==='battle'&&a?.kind==='king'&&a.stage==='fight'&&a.round===1&&a.phase?.index===0&&a.phase.changed===false&&a.enemy?.id==='DK01'&&a.enemy.hp===a.enemy.maxHp&&Number.isSafeInteger(a.enemy.hp)&&a.enemy.hp>0&&starts.length===1&&starts[0].kind==='king'&&starts[0].enemyId===a.enemy.id&&starts[0].maxHp===a.enemy.maxHp;
 if(kingStart){
  resultEffects=copy(effects);time=800;
  steps.push({key:`${after.runId}:${after.revision}:presentation:0`,atMs:0,kind:'controls',payload:{enabled:false,actionsVisible:true}},
   {key:`${after.runId}:${after.revision}:presentation:1`,atMs:0,kind:'display',payload:{stage:'king.start',durationMs:800,motion:settings.reducedMotion?'fade':'none',enemy:copy(a.enemy),telegraph:copy(a.telegraph),music:{mode:'king',fadeMs:800}}},
   {key:`${after.runId}:${after.revision}:presentation:2`,atMs:800,kind:'controls',payload:{enabled:true,actionsVisible:true}});
  return result();
 }
 const recordedSpell=Array.isArray(after.battle?.history)&&after.battle.history.some(r=>r?.round===before.battle?.round&&r?.action?.type==='spell');
 // Only app callers with complete renderer/audio ownership may opt in. A failed
 // recognized spell is static, not a partial reroute to another planner.
 if(kingSpellTimeline===true&&before.battle?.kind==='king'&&(recordedSpell||effects.some(e=>e.t==='spellCast')))
  return kingResult(planKingSpellTimeline({before,after,effects,settings,spellVisual,victoryVisual}));
 const spellTurn=spellVisual===true&&recordedSpell;
 if(kingTurnVisual===true||spellTurn||(victoryVisual===true&&['battleReward','bagFull'].includes(after.phase))){const turn=planKingTurn({before,after,effects,settings,victoryVisual,spellVisual});if(turn)return kingResult(turn);}
 const moved=effects.find(e=>e.t==='moved'),rolled=effects.find(e=>e.t==='dieRolled');
 const battle=battleVisual===true&&!moved&&!rolled?normalAttackTurn(before,after,effects):null;
 if(!moved&&!rolled&&!battle)return result();
 // Fail closed for invalid/stale motion; never fabricate departure from the castle.
 if(moved&&(!Number.isInteger(moved.from)||!Number.isInteger(moved.to)||!Number.isInteger(moved.steps)||moved.from<1||moved.from>=100||moved.to>100||moved.to<=moved.from||moved.steps!==moved.to-moved.from||before.pos!==moved.from||after.pos!==moved.to))return result();
 if(rolled&&(!after.rolled||before.phase!=='board'||after.phase!=='rolled'||rolled.die!==after.rolled.die||before.pos!==after.pos||moved))return result();
 const castle=castleVisual===true&&moved?.stop==='castle'&&before.phase==='rolled'&&after.phase==='gate'&&moved.to===100&&effects.filter(e=>e.t==='castleReached').length===1;
 if(castleVisual&&moved?.stop==='castle'&&!castle)return result();
 const short=settings.animation==='short',reduced=!!settings.reducedMotion;
 const add=(kind,payload,atMs=time)=>{const step={key:`${after.runId}:${after.revision}:presentation:${steps.length}`,atMs,kind,payload};steps.push(step);return step};
 const display=(stage,durationMs,motion='none',payload={})=>{add('display',{stage,durationMs,motion,...copy(payload)});time+=durationMs};
 const sound=(cue,role='decorative',atMs=time)=>add('sound',{cue,role},atMs);
 resultEffects=copy(effects);
 add('controls',{enabled:false,actionsVisible:true});
 if(battle){
  const {round,action,enemyAct,enemyHit,heroHit,soften}=battle;
  display('battle.hero.prepare',reduced?0:short?100:250,reduced?'none':'advance',{round,action});
  display('battle.hero.slash',reduced?0:short?80:150,reduced?'none':'slash',{round});
  // White light and recoil start together: standard max(80,200), short 80.
  display('battle.enemy.hit',reduced?150:short?80:200,reduced?'fade':'impact',{
   round,hit:enemyHit,flashMs:reduced?0:80,recoilMs:reduced?0:short?80:200
  });
  display('battle.enemy.prepare',reduced?150:short?200:500,reduced?'fade':'prepare',{round,enemyAct});
  display('battle.hero.block',0,'none',{round,blocked:heroHit.blocked,sources:soften});
  display('battle.hero.hit',0,'none',{round,hit:heroHit});
  display('battle.result',0,'none',{round,enemyAct,enemyHit,heroHit,persistent:true});
 }else if(rolled){
  sound('dice.rattle');display('dice.roll',reduced?150:short?350:900,reduced?'fade':'bounce',{die:rolled.die});
  sound('dice.lock','committed');display('dice.lock',reduced?0:short?100:200,reduced?'none':'scale',{die:rolled.die});
  const preview=after.actions?.find(a=>a.type==='move'&&!a.adjust)?.preview;
  if(preview)display('preview',reduced?150:short?100:250,reduced?'fade':'draw',{preview});
 }else{
  // The actual moved payload is authoritative, including inn truncation/discarded die steps.
  const movement={from:moved.from,to:moved.to,steps:moved.steps,discarded:moved.discarded,die:moved.die,stop:moved.stop};
  const region=regionVisual===true&&moved.stop!=='castle'&&
   before.board?.band?.id===Math.ceil(moved.from/20)&&after.board?.band?.id===Math.ceil(moved.to/20)&&
   after.board.band.id===before.board.band.id+1?{pos:before.board.band.id*20+1,fromBand:before.board.band.id,band:copy(after.board.band)}:null;
  const enterRegion=(pos,atMs)=>{if(!region||pos!==region.pos)return;
   const durationMs=reduced?300:short?400:1200,bannerMs=short?600:1600;
   add('display',{stage:'region.transition',...region,durationMs,bannerMs,motion:reduced?'fade':'crossfade'},atMs);
   sound('card.flip','decorative',atMs);parallelEnd=Math.max(parallelEnd,atMs+Math.max(durationMs,bannerMs));
  };
  display('departure',reduced?0:short?80:150,reduced?'none':'bend',{from:moved.from});
  sound('step.first');
  if(reduced){
   const start=time;display('move.fade',150,'fade',movement);
   for(let i=0;i<moved.steps;i++){if(castle&&i===moved.steps-1)add('display',{stage:'castle.fade',durationMs:600,motion:'none'},start+i*50);enterRegion(moved.from+i+1,start+i*50);add('display',{stage:'trail',durationMs:0,motion:'none',pos:moved.from+i+1},start+i*50);}
   if(moved.steps>1)sound('step','decorative',start+(moved.steps-1)*50);time=Math.max(time,start+moved.steps*50);if(castle)time=start+(moved.steps-1)*50+600;
  }else{
   for(let i=0;i<moved.steps;i++){if(castle&&i===moved.steps-1)add('display',{stage:'castle.fade',durationMs:600,motion:'none'});enterRegion(moved.from+i+1,time+(short?120:320));if(i)sound('step');display('walk',castle&&i===moved.steps-1?600:short?120:320,'arc8px',{...movement,from:moved.from+i,to:moved.from+i+1,index:i})}
  }
  if(moved.stop==='castle'){
   display('arrival',0,'none',movement);if(castle)display('castle.arrive',0,'none');display('quiet',short?500:1000,'none',{music:false,effects:false});
   // Only the quiet board boundary; full castle staging is a later connection scope.
   if(!castle)sound('bell','committed');
  }else{sound('land');display('arrival',reduced?0:short?120:300,reduced?'none':'squash',movement)}
  if(!regionVisual&&before.board?.band?.id!==after.board?.band?.id)display('region.hold',3400,'none',{band:copy(after.board?.band)});
  if(moved.stop==='inn'){sound('door.bell','committed');display('inn.stop',short?500:1200,'none',movement)}
  // A real move may grant a level. No battle/event choreography is added here.
  if(effects.some(e=>e.t==='levelUp'))sound('levelup','committed');
 }
 time=Math.max(time,parallelEnd);
 add('controls',{enabled:true,actionsVisible:true});
 steps.sort((a,b)=>a.atMs-b.atMs);return result();
}

// Small injected-clock player, no browser/global timers, sound implementation or game ownership.
// onFinal always receives the confirmed final view/next actions, even on skip/cancel/renderer error.
export function createPresentationPlayer({clock,onStep=()=>{},onFinal=()=>{}}){
 let active=null,generation=0,state={running:false,finalView:null,reason:null,error:null};
 function end(job,reason,error=null,notify=true){
  if(active!==job)return false;
  active=null;for(const timer of job.timers)try{clock.clearTimeout(timer)}catch{}job.timers.clear();
  const terminal={running:false,finalView:job.plan.finalView,reason,error};state=terminal;
  const failedFinal=cause=>{if(state===terminal){terminal.error=cause;terminal.reason='error'}};
  if(notify)try{const response=onFinal({reason,finalView:job.plan.finalView,effects:job.plan.resultEffects||[],nextActions:job.plan.finalView?.actions||[],sounds:reason==='skip'?selectSkipSounds(job.plan.steps,job.played):[],error});if(response&&typeof response.then==='function')Promise.resolve(response).catch(failedFinal)}catch(cause){failedFinal(cause)}
  return true;
 }
 const api={
  get running(){return state.running},get finalView(){return state.finalView},get reason(){return state.reason},get error(){return state.error},
  play(plan){
   if(!plan||!Array.isArray(plan.steps)||!Number.isFinite(plan.durationMs)||plan.durationMs<0||plan.steps.some(s=>!Number.isFinite(s.atMs)||s.atMs<0||s.atMs>plan.durationMs))throw TypeError('invalid presentation plan');
   if(active)end(active,'superseded',null,false);
   const job={plan,timers:new Set(),played:new Set(),generation:++generation};active=job;state={running:true,finalView:plan.finalView,reason:null,error:null};
   try{
    for(const step of plan.steps)job.timers.add(clock.setTimeout(()=>{
     if(active!==job||job.generation!==generation)return;
     // Hand-off consumes the sound key before user code can re-enter skip/cancel/play.
     if(step.kind==='sound')job.played.add(step.key);
     try{const response=onStep(step);if(response&&typeof response.then==='function')Promise.resolve(response).catch(cause=>end(job,'error',cause))}catch(cause){end(job,'error',cause)}
    },step.atMs));
    job.timers.add(clock.setTimeout(()=>end(job,'finish'),plan.durationMs));
   }catch(cause){end(job,'error',cause)}
   return job.generation;
  },
  skip(){return active?end(active,'skip'):false},
  cancel(){return active?end(active,'cancel'):false}
 };return api;
}
