// Presentation for one already-committed ordinary escape; never decides whether escape succeeds.
const nn=n=>Number.isSafeInteger(n)&&n>=0;
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x};
const stableList=(a,b,fields)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&Array.from(a).every((e,i)=>e&&b[i]&&fields.every(k=>e[k]===b[i][k]));
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const equal=(a,b)=>{if(a===b)return true;if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&Array.from(a).every((v,i)=>equal(v,b[i]));if(!object(a)||!object(b))return false;const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]));};
function bagValid(b){
 if(!object(b)||!nn(b.capacity)||!Array.isArray(b.items)||!object(b.counts)||b.free!==b.capacity-b.items.length||b.free<0)return false;
 const counts={};for(let i=0;i<b.items.length;i++){const x=b.items[i];if(!object(x)||typeof x.id!=='string'||!x.id||x.index!==i)return false;counts[x.id]=(counts[x.id]||0)+1;}
 return equal(counts,b.counts);
}
function assisted(input){
 const {before,after,effects}=input,h=before?.hero,n=after?.hero;
 if(!h||!n||!Array.isArray(effects)||effects[0]?.t!=='itemUsed'||effects[0].id!=='HE20'||effects[0].where!=='flee'||Object.keys(effects[0]).length!==3)return null;
 // Unknown recovery hooks stay static. This first slice covers the real starter loadout only.
 if(h.job?.id!=='JB00'||h.companions?.length!==0||!Array.isArray(h.gear)||Array.from(h.gear).some(g=>!object(g)||g.equipped&&!['SW01','AR01'].includes(g.id)))return null;
 if(!bagValid(h.bag)||!bagValid(n.bag)||h.bag.capacity!==n.bag.capacity)return null;
 const index=h.bag.items.findIndex(x=>x?.id==='HE20');if(index<0)return null;
 const remaining=h.bag.items.filter((_,i)=>i!==index);
 if(!h.bag.items.every((x,i)=>x.index===i)||n.bag.items.length!==remaining.length||!n.bag.items.every((x,i)=>equal({...x,index:0},{...remaining[i],index:0}))||n.bag.free!==h.bag.free+1)return null;
 let at=1;
 for(const [key,max,base] of [['hp','maxHp',12],['mp','maxMp',3]]){
  if(!nn(h[key])||!nn(n[key])||!nn(h[max])||n[key]!==Math.min(h[max],h[key]+base))return null;
  const delta=n[key]-h[key];
  if(delta){const e=effects[at++];if(!e||Object.keys(e).length!==4||e.t!==key||e.before!==h[key]||e.after!==n[key]||e.delta!==delta)return null;}
 }
 if(at!==effects.length-1)return null;
 const normalized=structuredClone(input);normalized.effects=[effects[at]];
 normalized.after.hero.hp=h.hp;normalized.after.hero.mp=h.mp;normalized.after.hero.bag=structuredClone(h.bag);
 return {normalized,index:at};
}
export function planNormalFlee(input){
 if(input?.effects?.[0]?.t==='itemUsed'){
  const a=assisted(input);if(!a)return null;
  const plan=planNormalFlee(a.normalized);if(!plan)return null;
  const out=structuredClone(plan);out.finalView=structuredClone(input.after);out.resultEffects=structuredClone(input.effects);
  for(const step of out.steps)if('effectIndex' in step.payload)step.payload.effectIndex=a.index;
  return freeze(out);
 }
 if(!input||typeof input!=='object'||Array.isArray(input))return null;
 const {before,after,effects,settings={}}=input;
 const b=before?.battle,h=before?.hero,n=after?.hero,f=effects?.[0];
 if(!b||!h||!n||!settings||typeof settings!=='object'||Array.isArray(settings)||
  typeof before.runId!=='string'||!before.runId||after.runId!==before.runId||
  !nn(before.revision)||!nn(after.revision)||after.revision!==before.revision+1||
  !nn(before.pos)||before.pos<1||before.pos>=100||after.pos!==before.pos||!nn(before.rolls)||after.rolls!==before.rolls||
  before.phase!=='battle'||after.phase!=='board'||b.kind!=='normal'||b.stage!=='fight'||b.canFlee!==true||
  !nn(b.id)||!nn(b.round)||b.round===0||typeof b.enemy?.id!=='string'||!b.enemy.id||
  !nn(b.enemy.hp)||b.enemy.hp===0||!nn(b.enemy.maxHp)||b.enemy.hp>b.enemy.maxHp||
  after.battle!==null||after.event!=null||after.prompt!=null||before.reward!=null||after.reward!=null||
  before.result!=null||after.result!=null||before.victory!=null||after.victory!=null||
  !Array.isArray(effects)||effects.length!==1||!f||typeof f!=='object'||Array.isArray(f)||
  Object.keys(f).length!==2||f.t!=='fled'||f.enemyId!==b.enemy.id||
  !['hp','maxHp','mp','maxMp','gold','xp','level','attack','defense'].every(k=>nn(h[k])&&n[k]===h[k])||
  h.hp===0||h.hp>h.maxHp||h.mp>h.maxMp||
  !stableList(h.bag?.items,n.bag?.items,['id','index'])||!nn(h.bag.capacity)||h.bag.capacity!==n.bag.capacity||
  h.bag.free!==h.bag.capacity-h.bag.items.length||n.bag.free!==h.bag.free||
  !stableList(h.gear,n.gear,['id','iid','equipped','paidGold'])||!stableList(h.companions,n.companions,['id'])||
  !h.job?.id||n.job?.id!==h.job.id)return null;
 const mode='battle-flee',reduced=!!settings.reducedMotion,durationMs=reduced?150:settings.animation==='short'?200:500;
 const steps=[],add=(kind,atMs,payload)=>steps.push({key:`${after.runId}:${after.revision}:${mode}:${steps.length}`,atMs,kind,payload});
 add('controls',0,{enabled:false,actionsVisible:true});
 add('sound',0,{cue:'flee',role:'committed',effectIndex:0});
 add('display',0,{stage:'battle.flee.departure',durationMs,motion:reduced?'fade':'retreat',effect:f,effectIndex:0});
 add('display',durationMs,{stage:'battle.flee.result',durationMs:0,motion:'none',effect:f,effectIndex:0,reward:false,persistent:true});
 add('controls',durationMs,{enabled:true,actionsVisible:true});
 return freeze(structuredClone({mode,steps,durationMs,finalView:after,resultEffects:effects}));
}
