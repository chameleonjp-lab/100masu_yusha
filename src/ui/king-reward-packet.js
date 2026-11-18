// Validate the ordered, already committed DK01 reward suffix, never compute rewards.
const nn=n=>Number.isSafeInteger(n)&&n>=0;
const id=x=>typeof x==='string'&&x.length>0;
const rows=['maxHp','maxMp','attack','defense'];
const list=(a,key)=>Array.isArray(a)&&Array.from(a).every(x=>x&&id(x[key]));
const same=(a,b,keys)=>keys.every(k=>a?.[k]===b?.[k]);
export function readKingRewardPacket({before,after,effects,victoryIndex}){
 const h=before?.hero,n=after?.hero,r=after?.reward;
 if(!h||!n||!Number.isSafeInteger(victoryIndex)||victoryIndex<0||typeof before.runId!=='string'||!before.runId||
  before.runId!==after.runId||!nn(before.revision)||!nn(after.revision)||after.revision!==before.revision+1||
  !['battleReward','bagFull'].includes(after.phase)||after.result!=null||r?.enemyId!=='DK01'||r.victory!==true||
  !Array.isArray(effects)||Array.from(effects).some(e=>!e||typeof e!=='object'||Array.isArray(e)))return null;
 let i=victoryIndex;
 const win=effects[i++],goldIndex=i,g=effects[i++],xpIndex=i,x=effects[i++];
 if(win?.t!=='victory'||win.enemyId!=='DK01'||g?.t!=='gold'||g.reason!=='battle'||!nn(g.delta)||!nn(g.before)||!nn(g.after)||g.before!==h.gold||g.after!==g.before+g.delta||g.after!==n.gold||r.gold!==g.delta||
  x?.t!=='xp'||x.reason!=='battle'||!nn(x.amount)||!nn(h.xp)||!nn(x.total)||x.total!==h.xp+x.amount||x.total!==n.xp||r.xp!==x.amount)return null;
 let levelIndex=null,gearIndex=null,itemIndex=null;
 if(effects[i]?.t==='levelUp'){
  levelIndex=i;const l=effects[i++];
  if(!nn(h.level)||!nn(n.level)||n.level<=h.level||l.from!==h.level||l.to!==n.level||h.levelRow?.level!==h.level||n.levelRow?.level!==n.level||
   !nn(h.xpToNext)||h.xpToNext===0||x.amount<h.xpToNext||!nn(n.levelRow?.totalXp)||x.total<n.levelRow.totalXp||
   rows.some(k=>!nn(h.levelRow?.[k])||!nn(n.levelRow?.[k])||!nn(l.gains?.[k])||!nn(l.stats?.[k])||l.gains[k]!==n.levelRow[k]-h.levelRow[k]||l.stats[k]!==n.levelRow[k]||!nn(h[k])||!nn(n[k])||n[k]-h[k]!==l.gains[k]))return null;
 }else if(n.level!==h.level||rows.some(k=>!nn(h[k])||n[k]!==h[k])||(nn(h.xpToNext)&&x.amount>=h.xpToNext))return null;
 if(!list(h.gear,'iid')||!list(n.gear,'iid')||!list(h.bag?.items,'id')||!list(n.bag?.items,'id')||
  !nn(h.bag.capacity)||n.bag.capacity!==h.bag.capacity||h.bag.free!==h.bag.capacity-h.bag.items.length||n.bag.free!==n.bag.capacity-n.bag.items.length||
  h.bag.free<0||n.bag.free<0||!['sword','armor'].every(k=>same(h.equipment?.[k],n.equipment?.[k],['iid','id'])))return null;
 const savedGear=r.gear,gearBefore=h.gear,gearAfter=n.gear;
 if(!savedGear||typeof savedGear.hit!=='boolean'||typeof savedGear.alreadyOwned!=='boolean')return null;
 if(savedGear.hit&&!savedGear.alreadyOwned){
  gearIndex=i;const e=effects[i++],added=gearAfter.at(-1);
  if(!id(savedGear.id)||!['剣','防具'].includes(savedGear.kind)||e?.t!=='gearGained'||e.id!==savedGear.id||!id(e.iid)||e.paidGold!==null||
   gearBefore.some(z=>z.iid===e.iid||z.id===e.id)||gearAfter.length!==gearBefore.length+1||
   added?.iid!==e.iid||added.id!==e.id||added.category!==savedGear.kind||added.equipped!==false||added.paidGold!==null)return null;
  if(effects[i]?.t==='discover'){const d=effects[i++];if(d.kind!=='gear'||d.id!==e.id)return null;}
 }else if(savedGear.id!==null||(savedGear.hit!==savedGear.alreadyOwned)||gearAfter.length!==gearBefore.length)return null;
 if(gearBefore.some((e,j)=>!same(e,gearAfter[j],['iid','id','paidGold','equipped','category'])))return null;
 const rewardIndex=i,summary=effects[i++];
 if(summary?.t!=='rewards'||summary.gold!==g.delta||summary.xp!==x.amount||!same(summary.gear,savedGear,['hit','alreadyOwned','id'])||
  !same(summary.item,r.item,['hit','id'])||typeof r.item?.hit!=='boolean')return null;
 const bags=h.bag.items,next=n.bag.items;
 if(bags.some((e,j)=>e.id!==next[j]?.id))return null;
 if(after.phase==='bagFull'){
  const e=effects[i++],prompt=after.prompt;
  if(!r.item.hit||!id(r.item.id)||r.item.state!=='prompt'||next.length!==bags.length||h.bag.free!==0||
   e?.t!=='bagFull'||e.itemId!==r.item.id||e.source!=='reward'||prompt?.kind!=='bagFull'||prompt.source!=='reward'||prompt.itemId!==e.itemId)return null;
 }else if(r.item.hit){
  itemIndex=i;const e=effects[i++];
  if(!id(r.item.id)||r.item.state!=='added'||e?.t!=='itemGained'||e.id!==r.item.id||next.length!==bags.length+1||next.at(-1).id!==e.id||after.prompt!=null)return null;
 }else if(r.item.id!==null||r.item.state!=='none'||next.length!==bags.length||after.prompt!=null)return null;
 return i===effects.length?{goldIndex,xpIndex,rewardIndex,levelIndex,gearIndex,itemIndex}:null;
}
