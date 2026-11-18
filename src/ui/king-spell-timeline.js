import {consumeSpellTurn} from './spell-effect-consumer.js';
import {planKingCrownSegment} from './king-crown-segment.js';
import {planKingVictorySegment} from './king-victory-segment.js';

const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x};
const tellCue=k=>/大/.test(k)?'tell.big':/守/.test(k)?'tell.guard':/隙/.test(k)?'tell.open':'tell.attack';

// The caller must own playback dedup and capability-check every required stage,
// sprite and dedicated audio hook. This function does not start playback.
export function planKingSpellTimeline(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return null;
 const {before,after,effects,settings={},spellVisual=false,victoryVisual=false}=input;
 if(spellVisual!==true||before?.battle?.kind!=='king'||!settings||typeof settings!=='object'||Array.isArray(settings))return null;
 const packet=consumeSpellTurn({before,after,effects});if(!packet)return null;
 const {crown,victory}=packet.boundaries,terminal=victory!==null;
 if(terminal&&victoryVisual!==true)return null;
 const segment=terminal?planKingVictorySegment({before,after,effects,settings}):crown!==null?planKingCrownSegment({before,after,effects,settings}):null;
 if((terminal||crown!==null)&&!segment)return null;
 const mode=terminal?'king-victory-turn':'king-turn',reduced=!!settings.reducedMotion,short=settings.animation==='short'&&!reduced;
 const steps=[],telegraph=before.battle.telegraph;
 let time=0,lastEnemyHitTime=null;
 const add=(kind,payload,atMs=time)=>steps.push({key:`${after.runId}:${after.revision}:${mode}:${steps.length}`,atMs,kind,payload});
 const display=(stage,effectIndex,durationMs,payload={})=>{add('display',{stage,effectIndex,durationMs,...payload});time+=durationMs};
 const sound=(cue,effectIndex,options)=>add('sound',{cue,effectIndex,role:'committed',...(options?{options}:{})});
 function appendSegment(effectIndex,anchor,isCrown){
  for(const {key,atMs,cue,role,...payload} of segment.steps){
   if(cue)add('sound',{cue,role,effectIndex},anchor+atMs);
   else add('display',isCrown?{...payload,effectIndex,telegraph}:{...payload,effectIndex},anchor+atMs);
  }
  time=Math.max(time,anchor+segment.durationMs);
 }
 add('controls',{enabled:false,actionsVisible:true});
 for(const {index,effect:e} of packet.events){
  switch(e.t){
   case 'mp':display('king.turn.spell.mp',index,0,{effect:e,motion:'none'});break;
   case 'spellCast':
    sound('cast',index);display('king.turn.spell.prepare',index,short?120:300,{effect:e,motion:reduced?'fade':'none'});
    sound('cast.'+packet.spellId.toLowerCase(),index);display('king.turn.spell.cast',index,short?120:300,{effect:e,motion:reduced?'fade':'sparkle'});break;
   case 'hp':
    display('king.turn.spell.hp',index,reduced?0:short?150:400,{effect:e,motion:reduced?'none':'heal'});break;
   case 'hit':
    if(e.target==='enemy'){
     lastEnemyHitTime=time;
     display('king.turn.enemy.hit',index,reduced?150:short?80:200,{hit:e,telegraph,motion:reduced?'fade':'impact',flashMs:reduced?0:80,recoilMs:reduced?0:short?80:200});
    }else{
     if(e.amount||e.blocked)sound(e.amount?'hit.party':'shield',index);
     display('king.turn.hero.hit',index,reduced?0:short?80:150,{hit:e,motion:'none'});
    }
    break;
   case 'phaseChange':if(!terminal)appendSegment(index,lastEnemyHitTime,true);break;
   case 'enemyAct':display('king.turn.enemy.prepare',index,reduced?150:short?200:500,{enemyAct:e,telegraph,motion:reduced?'fade':'prepare'});break;
   case 'companion':
    if(e.role==='medic')sound('heal',index);else sound('support',index,{role:e.role});
    display('king.turn.spell.support',index,reduced?150:short?100:250,{effect:e,motion:reduced?'fade':'support'});break;
   case 'rule':
   case 'dieSoften':
    display('king.turn.spell.blockSource',index,0,{effect:e,motion:'none'});break;
   case 'enemyTell':
    display('king.turn.nextTell',index,0,{telegraph:after.battle.telegraph,motion:'none'});
    sound(tellCue(e.kind),index);break;
   case 'victory':appendSegment(index,time,false);break;
   // Reward events are retained, but the final view owns their presentation.
   case 'gold':case 'xp':case 'rewards':case 'bagFull':break;
   default:return null;
  }
 }
 add('controls',{enabled:true,actionsVisible:true});steps.sort((a,b)=>a.atMs-b.atMs);
 return freeze(structuredClone({mode,spellId:packet.spellId,steps,durationMs:time,finalView:after,resultEffects:effects}));
}
