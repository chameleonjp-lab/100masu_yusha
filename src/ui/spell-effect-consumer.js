import {readKingRewardPacket} from './king-reward-packet.js';
// A pure, ordered consumer of a successfully committed spell turn, not a save proof.
const kinds={SP01:'attack',SP02:'heal',SP03:'guard',SP04:'finisher'};
const nn=n=>Number.isSafeInteger(n)&&n>=0;
const pos=n=>nn(n)&&n>0;
const sameTell=(x,y)=>!!x&&!!y&&['name','kind','attack','defense'].every(k=>x[k]===y[k]);
const deepFreeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(deepFreeze);Object.freeze(x)}return x};
const hasRole=(b,id,role)=>Array.isArray(b.companionNotes)&&b.companionNotes.some(n=>n?.id===id&&n.role===role);
const wall=m=>m?.id==='SP03-wall'&&m.owner==='spell:SP03'&&m.hook==='enemyDamage'&&m.uses===1;
const plainGear=g=>g?.hit===false&&g.id===null&&g.alreadyOwned===false;
export function consumeSpellTurn(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return null;
 const {before,after,effects,expandedRewards=false}=input;
 const b=before?.battle,a=after?.battle,h=before?.hero,next=after?.hero;
 if(!b||!a||!h||!next||typeof before.runId!=='string'||!before.runId||before.runId!==after.runId||
  !nn(before.revision)||!nn(after.revision)||after.revision!==before.revision+1||before.phase!=='battle'||before.pos!==after.pos||before.rolls!==after.rolls||
  b.stage!=='fight'||!nn(b.id)||b.id!==a.id||!pos(b.round)||b.kind!==a.kind||!['king','normal','optional'].includes(b.kind)||!b.enemy?.id||b.enemy.id!==a.enemy?.id||
  !pos(b.enemy.hp)||!pos(b.enemy.maxHp)||b.enemy.hp>b.enemy.maxHp||b.enemy.maxHp!==a.enemy.maxHp||
  !pos(h.hp)||!pos(h.maxHp)||h.hp>h.maxHp||!nn(h.mp)||!nn(h.maxMp)||h.mp>h.maxMp||
  (expandedRewards!==true||!['battleReward','bagFull'].includes(after.phase))&&(h.maxHp!==next.maxHp||h.maxMp!==next.maxMp||h.level!==next.level)||
  !Array.isArray(effects)||Array.from(effects).some(e=>!e||typeof e!=='object'||Array.isArray(e))||
  !Array.isArray(a.history)||Array.from(a.history).some(r=>!r||typeof r!=='object'||Array.isArray(r))||!Array.isArray(b.marks)||!Array.isArray(a.marks))return null;
 const recs=a.history.filter(r=>r.round===b.round),rec=recs[0],action=rec?.action,sp=action?.spellId;
 const kind=Object.hasOwn(kinds,sp)?kinds[sp]:null,offers=Array.isArray(b.spells)?b.spells.filter(o=>o?.id===sp):[],offer=offers[0];
 const [mp,cast]=effects;
 if(recs.length!==1||!kind||action.type!=='spell'||action.target!=null||action.targets!==undefined||action.choiceId!==undefined||
  rec.enemy!==b.telegraph?.name||offers.length!==1||offer.enabled!==true||offer.kind!==kind||
  mp?.t!=='mp'||mp.reason!=='spell'||mp.before!==h.mp||!nn(mp.after)||mp.after>=mp.before||mp.delta!==mp.after-mp.before||
  cast?.t!=='spellCast'||cast.id!==sp||cast.kind!==kind||cast.cost!==-mp.delta||action.spellKind!==kind||
  action.cost!==cast.cost||offer.cost!==cast.cost||action.spellMpAfter!==mp.after||offer.mpAfter!==mp.after||next.mp!==mp.after)return null;
 let i=2,enemyHp=b.enemy.hp,hp=h.hp,dealt=0,lost=0,crown=null,victory=null,nextTell=null,wallSpent=false;
 const cur=()=>effects[i];
 function enemyHit(){
  const e=cur();
  if(e?.t!=='hit'||e.target!=='enemy'||!pos(e.amount)||e.blocked!==undefined||!nn(e.hp)||enemyHp-e.amount!==e.hp||e.maxHp!==b.enemy.maxHp)return false;
  enemyHp=e.hp;i++;
  if(cur()?.t==='phaseChange'){
   if(b.kind!=='king'||b.enemy.id!=='DK01'||crown!==null||b.phase?.index!==0||!enemyHp||enemyHp>Math.floor(b.enemy.maxHp/2)||cur().hp!==enemyHp)return false;
   crown=i++;
  }
  return true;
 }
 function recover(reason){
  const e=cur();
  if(e?.t!=='hp'||e.reason!==reason||e.before!==hp||!pos(e.delta)||!nn(e.after)||e.after!==hp+e.delta||e.after>h.maxHp)return null;
  hp=e.after;i++;return e;
 }
 if(kind==='attack'||kind==='finisher'){
  dealt=cur()?.amount;if(!enemyHit())return null;
 }else if(kind==='heal'&&!recover('spell'))return null;
 if(enemyHp&&cur()?.t==='hit'&&cur().target==='enemy'){
  const prior=enemyHp;
  if(b.telegraph?.kind!=='反撃の隙'||!hasRole(b,'CP03','thrower')||!enemyHit())return null;
  const support=cur();
  if(support?.t!=='companion'||support.id!=='CP03'||support.role!=='thrower'||support.amount!==prior-enemyHp)return null;
  i++;
 }
 if(enemyHp){
  const e=cur(),t=b.telegraph;
  if(!nn(t?.hitCount)||t.hitCount>effects.length-i||e?.t!=='enemyAct'||e.round!==b.round||e.name!==t?.name||e.kind!==t?.kind||e.attack!==t?.attack)return null;
  i++;
  for(let count=0;count<(t.hitCount??0);count++){
   let knownBlocked=0,hasWall=false;
   if(cur()?.t==='rule'){
    const r=cur();
    if(wallSpent||r.id!=='SP03-wall'||r.owner!=='spell:SP03'||r.hook!=='enemyDamage'||(kind!=='guard'&&!b.marks.some(wall)))return null;
    wallSpent=true;hasWall=true;i++;
   }
   if(cur()?.t==='companion'&&cur().role==='shield'){
    const s=cur();
    if(!hasRole(b,'CP01','shield')||s.id!=='CP01'||t.kind!=='大技'||!pos(s.amount))return null;
    knownBlocked+=s.amount;i++;
   }
   if(cur()?.t==='dieSoften'){
    if(!pos(cur().amount))return null;
    knownBlocked+=cur().amount;i++;
   }
   const hit=cur();
   if(hit?.t!=='hit'||hit.target!=='hero'||hit.enemyKind!==t.kind||hit.guarded!==false||!nn(hit.amount)||!nn(hit.hp)||!nn(hit.base)||!nn(hit.blocked)||!nn(hit.potentialDamage)||hit.amount!==Math.min(hp,hit.potentialDamage)||hit.blocked!==Math.max(0,hit.base-hit.potentialDamage)||(hasWall?knownBlocked>hit.blocked:knownBlocked!==hit.blocked)||hp-hit.amount!==hit.hp||hit.maxHp!==h.maxHp)return null;
   lost+=hit.amount;hp=hit.hp;i++;
   if(hp===0)return null; // defeat handling intentionally outside this slice
  }
  if(cur()?.t==='hp'){
   const healed=recover('companion'),s=cur();
   if(!healed||s?.t!=='companion'||s.id!=='CP02'||s.role!=='medic'||s.amount!==healed.delta||!hasRole(b,'CP02','medic'))return null;
   i++;
  }
  const tell=cur();
  if(after.phase!=='battle'||a.stage!=='fight'||a.round!==b.round+1||tell?.t!=='enemyTell'||tell.round!==a.round||!sameTell(tell,a.telegraph))return null;
  nextTell=i++;
 }else if(expandedRewards===true){
  if(b.kind!=='king'||a.stage!=='won'||a.round!==b.round||!sameTell(a.telegraph,b.telegraph)||!readKingRewardPacket({before,after,effects,victoryIndex:i}))return null;
  victory=i;i=effects.length;
 }else{
  const [win,gold,xp,reward,bag]=effects.slice(i);
  if(!['battleReward','bagFull'].includes(after.phase)||a.stage!=='won'||a.round!==b.round||!sameTell(a.telegraph,b.telegraph)||after.result!=null||
   win?.t!=='victory'||win.enemyId!==b.enemy.id||gold?.t!=='gold'||gold.reason!=='battle'||!nn(gold.delta)||!nn(gold.before)||gold.before!==h.gold||gold.after!==gold.before+gold.delta||gold.after!==next.gold||
   xp?.t!=='xp'||xp.reason!=='battle'||!nn(xp.amount)||!nn(h.xp)||xp.total!==h.xp+xp.amount||xp.total!==next.xp||
   reward?.t!=='rewards'||reward.gold!==gold.delta||reward.xp!==xp.amount||!plainGear(reward.gear)||
   after.reward?.enemyId!==b.enemy.id||after.reward.victory!==true||after.reward.gold!==gold.delta||after.reward.xp!==xp.amount||!plainGear(after.reward.gear))return null;
  victory=i;i+=4;
  const item=reward.item,finalItem=after.reward.item;
  if(after.phase==='bagFull'){
   if(bag?.t!=='bagFull'||bag.source!=='reward'||item?.hit!==true||typeof item.id!=='string'||!item.id||bag.itemId!==item.id||finalItem?.hit!==true||finalItem.id!==item.id||finalItem.state!=='prompt'||after.prompt?.kind!=='bagFull'||after.prompt.source!=='reward'||after.prompt.itemId!==item.id)return null;
   i++;
  }else if(item?.hit!==false||item.id!==null||finalItem?.hit!==false||finalItem.id!==null||finalItem.state!=='none'||after.prompt!=null)return null;
 }
 if(i!==effects.length||a.enemy.hp!==enemyHp||next.hp!==hp||rec.dealt!==dealt||rec.hpLost!==lost||
  (kind==='guard'&&b.marks.some(wall))||((kind==='guard'||b.marks.some(wall))&&a.marks.some(wall)!==!wallSpent))return null;
 if(b.kind==='king'&&(b.enemy.id!=='DK01'||before.pos!==100||![0,1].includes(b.phase?.index)||b.phase.changed!==(b.phase.index===1)||
  a.phase?.index!==(crown!==null&&victory===null?1:b.phase.index)||a.phase.changed!==(crown!==null||b.phase.changed)||
  (victory!==null&&(after.victory?.enemyId!=='DK01'||after.victory.battleId!==b.id||after.victory.pos!==100||after.victory.rolls!==after.rolls))))return null;
 return deepFreeze({spellId:sp,events:effects.map((effect,index)=>({index,effect:structuredClone(effect)})),boundaries:{crown,victory,nextTell}});
}
