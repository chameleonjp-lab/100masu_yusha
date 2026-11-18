import {readKingRewardPacket} from './king-reward-packet.js';
// Presentation decorator for a validated king-victory-turn only.
// It never makes an unsupported battle result eligible.
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x};
const nn=n=>Number.isSafeInteger(n)&&n>=0;
export function appendKingRewardSequence(plan,settings,{before,expandedRewards=false}={}){
 const view=plan?.finalView,r=view?.reward,fx=plan?.resultEffects;
 if(plan?.mode!=='king-victory-turn'||r?.enemyId!=='DK01'||r.victory!==true||
  !['battleReward','bagFull'].includes(view.phase)||!Array.isArray(fx)||!Array.isArray(plan.steps)||!nn(plan.durationMs))return null;
 const final=plan.steps.at(-1);
 if(final?.kind!=='controls'||final.payload.enabled!==true||final.atMs!==plan.durationMs)return null;
 const locate=t=>fx.findIndex(e=>e.t===t),goldIndex=locate('gold'),xpIndex=locate('xp'),rewardIndex=locate('rewards');
 const packet=expandedRewards===true?readKingRewardPacket({before,after:view,effects:fx,victoryIndex:locate('victory')}):null;
 if(expandedRewards===true&&!packet)return null;
 if(!packet){
 if(goldIndex<0||xpIndex<=goldIndex||rewardIndex<=xpIndex||!nn(r.gold)||!nn(r.xp)||
  fx[goldIndex].delta!==r.gold||fx[xpIndex].amount!==r.xp||fx[rewardIndex].gold!==r.gold||fx[rewardIndex].xp!==r.xp||
  r.gear?.hit!==false||r.gear.id!==null||r.gear.alreadyOwned!==false)return null;
 if(view.phase==='bagFull'?(r.item?.hit!==true||r.item.state!=='prompt'||r.item.id!==view.prompt?.itemId):(r.item?.hit!==false||r.item.id!==null||r.item.state!=='none'))return null;
 }
 const key=`${view.runId}:${view.revision}:king-reward`,steps=plan.steps.slice(0,-1);
 const durationMs=settings?.reducedMotion?0:settings?.animation==='short'?150:400;
 let atMs=plan.durationMs;
 const display=(name,payload,duration=durationMs)=>{steps.push({key:`${key}:${name}`,atMs,kind:'display',payload:{stage:'king.reward.'+name,durationMs:duration,motion:'none',...payload}});atMs+=duration;};
 const sound=(label,cue,effectIndex)=>steps.push({key:`${key}:${label}`,atMs,kind:'sound',payload:{cue,role:'committed',effectIndex}});
 if(r.gold>0)sound('coin','coin.in',goldIndex);
 display('money',{gold:r.gold,xp:r.xp,effectIndex:goldIndex,effectIndices:[goldIndex,xpIndex]});
 if(packet?.levelIndex!=null){const effectIndex=packet.levelIndex;sound('growth','levelup',effectIndex);display('levelUp',{effect:fx[effectIndex],effectIndex},settings?.reducedMotion?0:settings?.animation==='short'?400:1000);}
 if(packet?.gearIndex!=null)sound('gearCue',r.gear.kind==='剣'?'sheath':'buckle',packet.gearIndex);
 display('gear',{gear:r.gear,effectIndex:rewardIndex});
 if(packet?.itemIndex!=null)sound('itemCue','bag',packet.itemIndex);
 display('item',{item:r.item,effectIndex:rewardIndex});
 steps.push({...final,atMs});
 return freeze(structuredClone({...plan,steps,durationMs:atMs}));
}
