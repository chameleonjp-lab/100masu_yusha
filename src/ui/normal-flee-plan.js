// Presentation for one already-committed ordinary escape; never decides whether escape succeeds.
const nn=n=>Number.isSafeInteger(n)&&n>=0;
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x};
const stableList=(a,b,fields)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&Array.from(a).every((e,i)=>e&&b[i]&&fields.every(k=>e[k]===b[i][k]));
export function planNormalFlee(input){
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
