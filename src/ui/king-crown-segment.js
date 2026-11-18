// Visual-only INSERTION descriptor, deliberately not connected to the app/player.
// The host must have committed/read back this turn and must play its hit first,
// then this segment, then the remaining effects with the OLD telegraph.
// This is not a complete battle plan and never owns controls, saves or dispatch.
function freeze(x){if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x}
export function planKingCrownSegment({before,after,effects=[],settings={}}={}){
 const b=before?.battle,a=after?.battle,positive=n=>Number.isSafeInteger(n)&&n>0;
 if(!settings||typeof settings!=='object'||Array.isArray(settings)||!before||!after||typeof before.runId!=='string'||!before.runId||before.runId!==after.runId||
 !Number.isSafeInteger(before.revision)||after.revision!==before.revision+1||
 before.phase!=='battle'||after.phase!=='battle'||before.pos!==100||after.pos!==100||
 !b||!a||b.kind!=='king'||a.kind!=='king'||b.stage!=='fight'||a.stage!=='fight'||
 !Number.isSafeInteger(b.id)||b.id!==a.id||!positive(b.round)||a.round!==b.round+1||
 b.phase?.changed!==false||a.phase?.changed!==true||b.phase.index!==0||a.phase.index!==1||
 b.enemy?.id!=='DK01'||a.enemy?.id!=='DK01'||!positive(b.enemy.hp)||!positive(a.enemy.hp)||
 !positive(b.enemy.maxHp)||a.enemy.maxHp!==b.enemy.maxHp||b.enemy.hp>b.enemy.maxHp||a.enemy.hp>b.enemy.hp||
 !positive(before.hero?.hp)||!positive(after.hero?.hp)||!b.telegraph||
 !Array.isArray(effects)||effects.some(e=>!e||!['hit','phaseChange','enemyAct','dieSoften','enemyTell','mp','spellCast'].includes(e.t)))return null;
 const phases=effects.filter(e=>e.t==='phaseChange'),hits=effects.filter(e=>e.t==='hit'&&e.target==='enemy'),acts=effects.filter(e=>e.t==='enemyAct');
 if(phases.length!==1||hits.length!==1||acts.length!==1)return null;
 const heroHits=effects.filter(e=>e.t==='hit'&&e.target==='hero'),tells=effects.filter(e=>e.t==='enemyTell');
 if(heroHits.length!==1||tells.length!==1||effects.filter(e=>e.t==='hit').length!==2)return null;
 const heroHit=heroHits[0],tell=tells[0];
 if(!Number.isSafeInteger(heroHit.amount)||heroHit.amount<0||heroHit.hp!==after.hero.hp||before.hero.hp-heroHit.amount!==heroHit.hp||
 tell.round!==a.round||tell.name!==a.telegraph?.name||tell.kind!==a.telegraph?.kind||
 typeof tell.name!=='string'||typeof tell.kind!=='string'||
 effects.indexOf(heroHit)<=effects.indexOf(acts[0])||effects.indexOf(tell)<=effects.indexOf(heroHit))return null;
 const phase=phases[0],hit=hits[0],act=acts[0],index=effects.indexOf(phase),actIndex=effects.indexOf(act);
 if(index<1||effects[index-1]!==hit||actIndex<=index||!positive(hit.amount)||hit.hp!==phase.hp||
 hit.hp!==a.enemy.hp||hit.maxHp!==a.enemy.maxHp||b.enemy.hp-hit.amount!==hit.hp||
 act.round!==b.round||act.name!==b.telegraph.name||act.kind!==b.telegraph.kind)return null;
 // Only a prepared SP01 single-hit attack spell prefix is supported here.
 // Companion, healing, item and multi-hit effects remain unimplemented, not ignored.
 const casts=effects.filter(e=>e.t==='spellCast'),mps=effects.filter(e=>e.t==='mp');
 const recordedSpell=Array.isArray(a.history)&&a.history.some(r=>r?.round===b.round&&r.action?.type==='spell');
 if(casts.length||mps.length||recordedSpell){
  if(casts.length!==1||mps.length!==1)return null;
  const cast=casts[0],mp=mps[0],nonnegative=n=>Number.isSafeInteger(n)&&n>=0;
  const records=Array.isArray(a.history)?a.history.filter(r=>r?.round===b.round):[];
  const offers=Array.isArray(b.spells)?b.spells.filter(s=>s?.id===cast.id):[];
  const rec=records[0],action=rec?.action,offer=offers[0];
  if(effects[0]!==mp||effects[1]!==cast||effects[2]!==hit||cast.id!=='SP01'||cast.kind!=='attack'||!positive(cast.cost)||
   !nonnegative(before.hero.mp)||!nonnegative(after.hero.mp)||mp.reason!=='spell'||
   mp.before!==before.hero.mp||mp.after!==after.hero.mp||mp.delta!==-cast.cost||mp.before+mp.delta!==mp.after||
   records.length!==1||action?.type!=='spell'||action.spellId!==cast.id||action.spellKind!==cast.kind||
   action.cost!==cast.cost||action.spellMpAfter!==mp.after||action.target!=null||rec.dealt!==hit.amount||rec.hpLost!==heroHit.amount||
   offers.length!==1||offer.enabled!==true||offer.cost!==cast.cost||offer.mpAfter!==mp.after)return null;
 }
 // Threshold comes from the authoritative phaseChange, not a duplicated balance constant.
 const reduced=!!settings.reducedMotion,short=settings.animation==='short'&&!reduced;
 const end=short?1000:2400,crack=short?200:600,banner=short?600:1200;
 const key=`${after.runId}:${after.revision}:king-crown`;
 return freeze({afterEffectIndex:index-1,resumeEffectIndex:index+1,durationMs:end,
 continuingTelegraph:structuredClone(b.telegraph),persistent:{crownCracked:true,phaseBadge:true},
 steps:[
 {key:`${key}:pause`,atMs:short?0:150,stage:'king.crown.pause',durationMs:short?200:450,motion:'none',music:'pause'},
 {key:`${key}:sound`,atMs:crack,cue:'crown.crack',role:'committed'},
 {key:`${key}:crack`,atMs:crack,stage:'king.crown.crack',durationMs:reduced?0:short?200:600,motion:reduced?'none':'shard',persistent:true},
 {key:`${key}:banner`,atMs:banner,stage:'king.crown.banner',durationMs:end-banner,motion:reduced?'fade':'none',messageKey:'crownBreak',nextPhase:true},
 {key:`${key}:resume`,atMs:end,stage:'king.crown.resume',durationMs:0,motion:'none'}]});
}
