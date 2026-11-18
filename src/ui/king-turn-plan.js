import {planKingVictorySegment} from './king-victory-segment.js';
import {planKingCrownSegment} from './king-crown-segment.js';
const copy=x=>structuredClone(x);
function freeze(x){if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x}
// Committed, surviving single-hit normal attack by the hero against DK01 only.
// Unsupported/unknown effects fall back as a WHOLE turn; no effects are discarded.
export function planKingTurn({before,after,effects=[],settings={},spellVisual=false,victoryVisual=false}={}){
 if(victoryVisual===true&&['battleReward','bagFull'].includes(after?.phase))return planVictoryTurn({before,after,effects,settings,spellVisual});
 const b=before?.battle,a=after?.battle,nn=n=>Number.isSafeInteger(n)&&n>=0;
 if(!settings||typeof settings!=='object'||Array.isArray(settings)||!before||!after||!before.runId||typeof before.runId!=='string'||before.runId!==after.runId||!nn(before.revision)||!Number.isSafeInteger(after.revision)||after.revision!==before.revision+1||before.pos!==100||after.pos!==100||before.phase!=='battle'||after.phase!=='battle'||!b||!a||b.kind!=='king'||a.kind!=='king'||b.stage!=='fight'||a.stage!=='fight'||!nn(b.id)||b.id!==a.id||!nn(b.round)||b.round<1||a.round!==b.round+1||b.enemy?.id!=='DK01'||a.enemy?.id!=='DK01'||!Array.isArray(a.history)||!Array.isArray(effects)||effects.some(e=>!e||!['hit','phaseChange','enemyAct','dieSoften','enemyTell','mp','spellCast'].includes(e.t)))return null;
 if(![0,1].includes(b.phase?.index)||![0,1].includes(a.phase?.index)||typeof b.phase.changed!=='boolean'||typeof a.phase.changed!=='boolean'||b.phase.changed!==(b.phase.index===1)||a.phase.changed!==(a.phase.index===1))return null;
 if(a.history.some(r=>!r||typeof r!=='object'||Array.isArray(r)))return null;
 const records=a.history.filter(r=>r.round===b.round);if(records.length!==1)return null;
 const rec=records[0],action=rec.action;
 const spell=action?.type==='spell';
 if((!spell&&action?.type!=='attack')||(spell&&spellVisual!==true)||action.choiceId!==undefined||action.targets!==undefined||action.target!=null)return null;
 const get=t=>effects.filter(e=>e.t===t),enemyHits=get('hit').filter(e=>e.target==='enemy'),heroHits=get('hit').filter(e=>e.target==='hero'),acts=get('enemyAct'),tells=get('enemyTell'),soft=get('dieSoften'),phases=get('phaseChange');
 if(get('hit').length!==2||enemyHits.length!==1||heroHits.length!==1||acts.length!==1||tells.length!==1||soft.length>1||phases.length>1)return null;
 const eh=enemyHits[0],hh=heroHits[0],act=acts[0],tell=tells[0],idx=e=>effects.indexOf(e);
 if(idx(eh)>=idx(act)||idx(act)>=idx(hh)||idx(hh)>=idx(tell)||soft.some(e=>idx(e)<=idx(act)||idx(e)>=idx(hh)))return null;
 for(const [hit,prior,next] of [[eh,b.enemy,a.enemy],[hh,before.hero,after.hero]])if(!prior||!next||!nn(prior.hp)||!nn(next.hp)||prior.hp===0||next.hp===0||!nn(prior.maxHp)||!nn(next.maxHp)||prior.hp>prior.maxHp||next.hp>next.maxHp||!nn(hit.amount)||!nn(hit.hp)||!nn(hit.maxHp)||hit.hp>hit.maxHp||hit.hp!==next.hp||prior.hp-hit.amount!==hit.hp||hit.maxHp!==prior.maxHp||hit.maxHp!==next.maxHp)return null;
 if(!eh.amount||eh.blocked!==undefined||hh.guarded!==false||!['base','blocked','potentialDamage'].every(k=>nn(hh[k]))||hh.potentialDamage<hh.amount||soft.some(e=>!nn(e.amount)||e.amount>hh.blocked)||rec.dealt!==eh.amount||rec.hpLost!==hh.amount||act.round!==b.round||act.name!==b.telegraph?.name||act.kind!==b.telegraph?.kind||act.name!==rec.enemy||!nn(act.attack)||hh.enemyKind!==act.kind||tell.round!==a.round||tell.name!==a.telegraph?.name||tell.kind!==a.telegraph?.kind)return null;
 const casts=get('spellCast'),mps=get('mp');
 if(spell){
  if(casts.length!==1||mps.length!==1)return null;
  const cast=casts[0],mp=mps[0],offers=Array.isArray(b.spells)?b.spells.filter(s=>s?.id===cast.id):[],offer=offers[0];
  if(effects[0]!==mp||effects[1]!==cast||effects[2]!==eh||cast.id!=='SP01'||cast.kind!=='attack'||!nn(cast.cost)||cast.cost===0||
   !nn(before.hero.mp)||!nn(after.hero.mp)||mp.reason!=='spell'||mp.before!==before.hero.mp||mp.after!==after.hero.mp||mp.delta!==-cast.cost||mp.before+mp.delta!==mp.after||
   action.spellId!==cast.id||action.spellKind!==cast.kind||action.cost!==cast.cost||action.spellMpAfter!==mp.after||
   offers.length!==1||offer.enabled!==true||offer.cost!==cast.cost||offer.mpAfter!==mp.after)return null;
 }else if(casts.length||mps.length)return null;
 let crown=null;
 if(phases.length){crown=planKingCrownSegment({before,after,effects,settings});if(!crown)return null;}
 else if(b.phase?.index!==a.phase?.index||b.phase?.changed!==a.phase?.changed)return null;
 const reduced=!!settings.reducedMotion,short=settings.animation==='short'&&!reduced,steps=[];let time=0;
 const add=(kind,payload,atMs=time)=>steps.push({key:`${after.runId}:${after.revision}:king-turn:${steps.length}`,atMs,kind,payload:copy(payload)});
 const display=(stage,durationMs,payload={})=>{add('display',{stage,durationMs,...payload});time+=durationMs};
 add('controls',{enabled:false,actionsVisible:true});
 if(spell){
  // Display the committed prefix verbatim. Spell animation/audio are a later slice.
  display('king.turn.spell.mp',0,{effect:mps[0],motion:'none'});
  add('sound',{cue:'cast',role:'committed',effectIndex:idx(casts[0])});
  display('king.turn.spell.prepare',short?120:300,{effect:casts[0],motion:reduced?'fade':'none'});
  add('sound',{cue:'cast.sp01',role:'committed',effectIndex:idx(casts[0])});
  display('king.turn.spell.cast',short?120:300,{effect:casts[0],motion:reduced?'fade':'sparkle'});
 }else{
 display('king.turn.hero.prepare',reduced?0:short?100:250,{action,motion:reduced?'none':'advance'});
 display('king.turn.hero.slash',reduced?0:short?80:150,{motion:reduced?'none':'slash'});
 add('sound',{cue:'slash',role:'committed',effectIndex:idx(eh)});
 }
 const anchor=time;
 display('king.turn.enemy.hit',reduced?150:short?80:200,{hit:eh,telegraph:b.telegraph,motion:reduced?'fade':'impact',flashMs:reduced?0:80,recoilMs:reduced?0:short?80:200});
 if(crown){for(const step of crown.steps){const {key,atMs,cue,role,...payload}=step;add(cue?'sound':'display',cue?{cue,role,effectIndex:idx(phases[0])}:{...payload,telegraph:b.telegraph},anchor+atMs);}time=anchor+crown.durationMs;}
 display('king.turn.enemy.prepare',reduced?150:short?200:500,{enemyAct:act,telegraph:b.telegraph,motion:reduced?'fade':'prepare'});
 display('king.turn.hero.block',0,{blocked:hh.blocked,sources:soft,motion:'none'});
 if(hh.amount>0||hh.blocked>0)add('sound',{cue:hh.amount>0?'hit.party':'shield',role:'committed',effectIndex:idx(hh)});
 display('king.turn.hero.hit',0,{hit:hh,motion:'none'});
 display('king.turn.nextTell',0,{telegraph:a.telegraph,motion:'none'});
 add('sound',{cue:/大/.test(tell.kind)?'tell.big':/守/.test(tell.kind)?'tell.guard':/隙/.test(tell.kind)?'tell.open':'tell.attack',role:'committed',effectIndex:idx(tell)});
 add('controls',{enabled:true,actionsVisible:true});
 steps.sort((x,y)=>x.atMs-y.atMs);
 return freeze({mode:'king-turn',steps,durationMs:time,finalView:copy(after),resultEffects:copy(effects)});
}

// Deliberately narrow reward gate: no level-up, hooks, healing, gear or added items.
// bagFull may be retained as a pending prompt; no choice or continueReward is issued.
function planVictoryTurn({before,after,effects,settings,spellVisual}){
 const segment=planKingVictorySegment({before,after,effects,settings});if(!segment)return null;
 const b=before.battle,a=after.battle,nn=n=>Number.isSafeInteger(n)&&n>=0;
 if(!nn(after.revision)||!nn(b.id)||![0,1].includes(b.phase?.index)||![0,1].includes(a.phase?.index)||typeof b.phase.changed!=='boolean'||typeof a.phase.changed!=='boolean'||b.phase.changed!==(b.phase.index===1)||a.phase.changed!==(a.phase.index===1))return null;
 if(effects.some(e=>!['hit','victory','gold','xp','rewards','bagFull','mp','spellCast'].includes(e.t))||!Array.isArray(a.history)||a.history.some(r=>!r||typeof r!=='object'||Array.isArray(r)))return null;
 const records=a.history.filter(r=>r.round===b.round);if(records.length!==1)return null;
 const rec=records[0],action=rec.action;
 const spell=action?.type==='spell';
 if((spell?spellVisual!==true:action?.type!=='attack')||action.choiceId!==undefined||action.targets!==undefined||action.target!=null||rec.hpLost!==0||rec.enemy!==b.telegraph?.name||a.telegraph?.name!==b.telegraph?.name||a.telegraph?.kind!==b.telegraph?.kind||a.telegraph?.attack!==b.telegraph?.attack||a.telegraph?.defense!==b.telegraph?.defense||a.phase?.index!==b.phase?.index||a.phase?.changed!==b.phase?.changed)return null;
 for(const k of ['hp','maxHp','maxMp','level',...(spell?[]:['mp'])])if(!nn(before.hero[k])||after.hero[k]!==before.hero[k])return null;
 if(before.hero.hp>before.hero.maxHp||before.hero.mp>before.hero.maxMp)return null;
 const one=t=>effects.filter(e=>e.t===t),hits=one('hit'),wins=one('victory'),golds=one('gold'),xps=one('xp'),rewards=one('rewards'),bags=one('bagFull');
 if(hits.length!==1||wins.length!==1||golds.length!==1||xps.length!==1||rewards.length!==1||bags.length>1)return null;
 const h=hits[0],gold=golds[0],xp=xps[0],reward=rewards[0],ix=e=>effects.indexOf(e),mps=one('mp'),casts=one('spellCast'),offset=spell?2:0;
 if(spell){
  if(mps.length!==1||casts.length!==1||('companionActed' in rec&&(!Array.isArray(rec.companionActed)||rec.companionActed.length!==0)))return null;
  const mp=mps[0],cast=casts[0],offers=Array.isArray(b.spells)?b.spells.filter(s=>s?.id==='SP01'):[],offer=offers[0];
  if(effects[0]!==mp||effects[1]!==cast||cast.id!=='SP01'||cast.kind!=='attack'||!nn(cast.cost)||cast.cost===0||!nn(before.hero.mp)||!nn(after.hero.mp)||after.hero.mp>after.hero.maxMp||mp.reason!=='spell'||mp.before!==before.hero.mp||mp.after!==after.hero.mp||mp.delta!==-cast.cost||mp.before+mp.delta!==mp.after||action.spellId!==cast.id||action.spellKind!==cast.kind||action.cost!==cast.cost||action.spellMpAfter!==mp.after||offers.length!==1||offer.enabled!==true||offer.cost!==cast.cost||offer.mpAfter!==mp.after)return null;
 }else if(mps.length||casts.length)return null;
 if(h.target!=='enemy'||h.blocked!==undefined||rec.dealt!==h.amount||ix(h)!==offset+0||ix(wins[0])!==offset+1||ix(gold)!==offset+2||ix(xp)!==offset+3||ix(reward)!==offset+4)return null;
 if(!nn(gold.delta)||!nn(gold.before)||!nn(gold.after)||gold.reason!=='battle'||gold.before!==before.hero.gold||gold.after!==after.hero.gold||gold.before+gold.delta!==gold.after||!nn(xp.amount)||!nn(xp.total)||xp.reason!=='battle'||!nn(before.hero.xp)||xp.total!==after.hero.xp||before.hero.xp+xp.amount!==xp.total)return null;
 const r=after.reward;if(!r||r.enemyId!=='DK01'||r.victory!==true||reward.gold!==gold.delta||reward.xp!==xp.amount||r.gold!==reward.gold||r.xp!==reward.xp||reward.gear?.hit!==false||reward.gear.id!==null||reward.gear.alreadyOwned!==false||r.gear?.hit!==false||r.gear.id!==null||r.gear.alreadyOwned!==false)return null;
 if(after.phase==='bagFull'){
  if(bags.length!==1||ix(bags[0])!==offset+5||reward.item?.hit!==true||typeof reward.item.id!=='string'||!reward.item.id||r.item?.hit!==true||r.item.id!==reward.item.id||r.item.state!=='prompt'||bags[0].itemId!==r.item.id||bags[0].source!=='reward'||after.prompt?.kind!=='bagFull'||after.prompt.itemId!==r.item.id||after.prompt.source!=='reward')return null;
 }else if(bags.length||reward.item?.hit!==false||reward.item.id!==null||r.item?.hit!==false||r.item.id!==null||r.item.state!=='none')return null;
 const reduced=!!settings.reducedMotion,short=settings.animation==='short'&&!reduced,steps=[];let time=0;
 const add=(kind,payload,atMs=time)=>steps.push({key:`${after.runId}:${after.revision}:king-victory-turn:${steps.length}`,atMs,kind,payload:copy(payload)});
 const display=(stage,durationMs,payload)=>{add('display',{stage,durationMs,...payload});time+=durationMs};
 add('controls',{enabled:false,actionsVisible:true});
 if(spell){
  display('king.turn.spell.mp',0,{effect:mps[0],motion:'none'});
  add('sound',{cue:'cast',role:'committed',effectIndex:1});
  display('king.turn.spell.prepare',short?120:300,{effect:casts[0],motion:reduced?'fade':'none'});
  add('sound',{cue:'cast.sp01',role:'committed',effectIndex:1});
  display('king.turn.spell.cast',short?120:300,{effect:casts[0],motion:reduced?'fade':'sparkle'});
 }else{
 display('king.turn.hero.prepare',reduced?0:short?100:250,{action,motion:reduced?'none':'advance'});
 display('king.turn.hero.slash',reduced?0:short?80:150,{motion:reduced?'none':'slash'});
 add('sound',{cue:'slash',role:'committed',effectIndex:0});
 }
 display('king.turn.enemy.hit',reduced?150:short?80:200,{hit:h,telegraph:b.telegraph,motion:reduced?'fade':'impact',flashMs:reduced?0:80,recoilMs:reduced?0:short?80:200});
 const anchor=time;
 for(const s of segment.steps){const {key,atMs,cue,role,...payload}=s;add(cue?'sound':'display',cue?{cue,role,effectIndex:offset+1}:payload,anchor+atMs)}
 time=anchor+segment.durationMs;add('controls',{enabled:true,actionsVisible:true});steps.sort((x,y)=>x.atMs-y.atMs);
 return freeze({mode:'king-victory-turn',steps,durationMs:time,finalView:copy(after),resultEffects:copy(effects)});
}
