// Presentation decorator for a validated king-victory-turn only.
// It never makes an unsupported battle result eligible.
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x};
const nn=n=>Number.isSafeInteger(n)&&n>=0;
export function appendKingRewardSequence(plan,settings){
 const view=plan?.finalView,r=view?.reward,fx=plan?.resultEffects;
 if(plan?.mode!=='king-victory-turn'||r?.enemyId!=='DK01'||r.victory!==true||
  !['battleReward','bagFull'].includes(view.phase)||!Array.isArray(fx)||!Array.isArray(plan.steps)||!nn(plan.durationMs))return null;
 const final=plan.steps.at(-1);
 if(final?.kind!=='controls'||final.payload.enabled!==true||final.atMs!==plan.durationMs)return null;
 const locate=t=>fx.findIndex(e=>e.t===t),goldIndex=locate('gold'),xpIndex=locate('xp'),rewardIndex=locate('rewards');
 if(goldIndex<0||xpIndex<=goldIndex||rewardIndex<=xpIndex||!nn(r.gold)||!nn(r.xp)||
  fx[goldIndex].delta!==r.gold||fx[xpIndex].amount!==r.xp||fx[rewardIndex].gold!==r.gold||fx[rewardIndex].xp!==r.xp||
  r.gear?.hit!==false||r.gear.id!==null||r.gear.alreadyOwned!==false)return null;
 if(view.phase==='bagFull'?(r.item?.hit!==true||r.item.state!=='prompt'||r.item.id!==view.prompt?.itemId):(r.item?.hit!==false||r.item.id!==null||r.item.state!=='none'))return null;
 const key=`${view.runId}:${view.revision}:king-reward`,steps=plan.steps.slice(0,-1);
 const durationMs=settings?.reducedMotion?0:settings?.animation==='short'?150:400;
 let atMs=plan.durationMs;
 const display=(name,payload)=>{steps.push({key:`${key}:${name}`,atMs,kind:'display',payload:{stage:'king.reward.'+name,durationMs,motion:'none',...payload}});atMs+=durationMs;};
 if(r.gold>0)steps.push({key:`${key}:coin`,atMs,kind:'sound',payload:{cue:'coin.in',role:'committed',effectIndex:goldIndex}});
 display('money',{gold:r.gold,xp:r.xp,effectIndex:goldIndex,effectIndices:[goldIndex,xpIndex]});
 display('gear',{gear:r.gear,effectIndex:rewardIndex});
 display('item',{item:r.item,effectIndex:rewardIndex});
 steps.push({...final,atMs});
 return freeze(structuredClone({...plan,steps,durationMs:atMs}));
}
