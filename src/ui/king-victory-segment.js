// A visual-only insertion at a committed king victory, not a complete turn plan.
// Leaves battleReward/bagFull and the later continueReward result untouched.
function freeze(x){if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x}
export function planKingVictorySegment(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input))return null;
 const {before,after,effects=[],settings={}}=input;
 const b=before?.battle,a=after?.battle,v=after?.victory,positive=n=>Number.isSafeInteger(n)&&n>0;
 if(!settings||typeof settings!=='object'||Array.isArray(settings)||!before||!after||
 typeof before.runId!=='string'||!before.runId||before.runId!==after.runId||
 !Number.isSafeInteger(before.revision)||before.revision<0||after.revision!==before.revision+1||before.phase!=='battle'||
 !['battleReward','bagFull'].includes(after.phase)||before.pos!==100||after.pos!==100||
 !b||!a||b.kind!=='king'||a.kind!=='king'||b.stage!=='fight'||a.stage!=='won'||
 !Number.isSafeInteger(b.id)||b.id!==a.id||!positive(b.round)||b.round!==a.round||
 !Number.isSafeInteger(before.rolls)||before.rolls<0||after.rolls!==before.rolls||v?.rolls!==after.rolls||b.enemy?.id!=='DK01'||a.enemy?.id!=='DK01'||
 !positive(b.enemy.hp)||b.enemy.hp>b.enemy.maxHp||a.enemy.hp!==0||!positive(b.enemy.maxHp)||a.enemy.maxHp!==b.enemy.maxHp||
 !positive(before.hero?.hp)||!positive(after.hero?.hp)||v?.enemyId!=='DK01'||v.battleId!==b.id||v.pos!==100||
 after.result!=null||!Array.isArray(effects)||effects.some(e=>!e||typeof e!=='object'||['defeat','runFinished','retryOffered','fled'].includes(e.t)))return null;
 const wins=effects.filter(e=>e.t==='victory'),lethal=effects.filter(e=>e.t==='hit'&&e.target==='enemy'&&e.hp===0);
 if(wins.length!==1||wins[0].enemyId!=='DK01'||lethal.length!==1||!positive(lethal[0].amount)||lethal[0].maxHp!==a.enemy.maxHp)return null;
 const hitIndex=effects.indexOf(lethal[0]),index=effects.indexOf(wins[0]);
 if(effects.slice(index+1).some(e=>['enemyAct','hit','phaseChange','enemyTell'].includes(e.t)))return null;
 if(hitIndex>=index||effects.slice(hitIndex+1,index).some(e=>['enemyAct','hit','phaseChange'].includes(e.t)))return null;
 let hp=b.enemy.hp;
 for(let i=0;i<effects.length;i++){const e=effects[i];if(e.t!=='hit'||e.target!=='enemy')continue;
  if(i>=index||!Number.isSafeInteger(e.amount)||e.amount<0||!Number.isSafeInteger(e.hp)||e.hp<0||e.maxHp!==b.enemy.maxHp||hp-e.amount!==e.hp)return null;hp=e.hp;
 }
 if(hp!==0)return null;
 const durationMs=settings.animation==='short'?300:1000,key=`${after.runId}:${after.revision}:king-victory`;
 return freeze({afterEffectIndex:index-1,resumeEffectIndex:index+1,durationMs,steps:[
 {key:`${key}:stop`,atMs:0,stage:'king.victory.music',music:'stop'},
 {key:`${key}:sound`,atMs:0,cue:'victory',role:'committed'},
 {key:`${key}:disappear`,atMs:0,stage:'king.victory.disappear',durationMs,motion:settings.reducedMotion?'fade':'smoke'},
 {key:`${key}:label`,atMs:durationMs,stage:'king.victory.label',persistent:true,messageKey:'kingDefeated'}]});
}
