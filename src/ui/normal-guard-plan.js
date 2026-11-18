// One confirmed plain guard against one ordinary enemy hit. No rule simulation.
const cues={'通常攻撃':'tell.attack','大技':'tell.big','守り':'tell.guard','反撃の隙':'tell.open'};
const nn=n=>Number.isSafeInteger(n)&&n>=0;
const pos=n=>nn(n)&&n>0;
const same=(a,b,keys)=>!!a&&!!b&&keys.every(k=>a[k]===b[k]);
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x};
export function planNormalGuard(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return null;
 const {before,after,effects,settings={}}=input;
 const b=before?.battle,a=after?.battle,h=before?.hero,n=after?.hero;
 if(!b||!a||!h||!n||!settings||typeof settings!=='object'||Array.isArray(settings)||
  typeof before.runId!=='string'||!before.runId||before.runId!==after.runId||!nn(before.revision)||!nn(after.revision)||after.revision!==before.revision+1||
  before.phase!=='battle'||after.phase!=='battle'||before.pos!==after.pos||before.rolls!==after.rolls||b.kind!=='normal'||a.kind!==b.kind||
  b.stage!=='fight'||a.stage!=='fight'||!nn(b.id)||b.id!==a.id||!pos(b.round)||a.round!==b.round+1||before.result!=null||after.result!=null||
  !b.enemy?.id||!same(a.enemy,b.enemy,['id','hp','maxHp'])||!pos(b.enemy.hp)||!pos(b.enemy.maxHp)||b.enemy.hp>b.enemy.maxHp||
  !pos(h.hp)||!pos(h.maxHp)||h.hp>h.maxHp||!pos(n.hp)||n.hp>h.maxHp||
  !['maxHp','level','xp','gold','mp','maxMp'].every(k=>nn(h[k])&&n[k]===h[k])||h.mp>h.maxMp||
  !Array.isArray(a.history)||Array.from(a.history).some(r=>!r||typeof r!=='object'||Array.isArray(r))||
  !Array.isArray(effects)||![4,5].includes(effects.length)||Array.from(effects).some(e=>!e||typeof e!=='object'||Array.isArray(e)))return null;
 const records=a.history.filter(r=>r.round===b.round),rec=records[0],action=rec?.action;
 if(records.length!==1||action?.type!=='guard'||Object.keys(action).length!==1||rec.dealt!==0||rec.enemy!==b.telegraph?.name)return null;
 const [guard,act]=effects,[hit,tell]=effects.slice(-2),soft=effects.length===5?effects[2]:null;
 if(guard.t!=='guard'||Object.keys(guard).length!==1||act.t!=='enemyAct'||act.round!==b.round||!same(act,b.telegraph,['name','kind','attack'])||
  b.telegraph.hitCount!==1||!pos(act.attack)||typeof act.name!=='string'||!act.name||!Object.hasOwn(cues,act.kind)||
  hit.t!=='hit'||hit.target!=='hero'||hit.guarded!==true||hit.enemyKind!==act.kind||!pos(hit.base)||!nn(hit.blocked)||!nn(hit.potentialDamage)||hit.blocked!==hit.base-hit.potentialDamage||
  !nn(hit.amount)||hit.amount!==hit.potentialDamage||rec.hpLost!==hit.amount||hit.hp!==h.hp-hit.amount||hit.hp!==n.hp||hit.maxHp!==h.maxHp||
  tell.t!=='enemyTell'||!Object.hasOwn(cues,tell.kind)||tell.round!==a.round||!same(tell,a.telegraph,['name','kind','attack','defense','tell'])||
  (soft&&(soft.t!=='dieSoften'||!pos(soft.amount)||soft.amount>hit.blocked||b.dieBonus?.kind!=='soften'||b.dieBonus.used!==false||a.dieBonus?.used!==true||soft.amount>b.dieBonus.amount)))return null;
 const mode='battle-guard',steps=[],reduced=!!settings.reducedMotion,short=settings.animation==='short';let atMs=0;
 const add=(kind,payload)=>steps.push({key:`${after.runId}:${after.revision}:${mode}:${steps.length}`,atMs,kind,payload});
 const display=(stage,effectIndex,durationMs,payload={})=>{add('display',{stage,effectIndex,durationMs,...payload});atMs+=durationMs;};
 const hitIndex=effects.length-2;
 add('controls',{enabled:false,actionsVisible:true});
 display('battle.hero.guard',0,reduced?0:short?100:200,{effect:guard,motion:reduced?'none':'shield'});
 display('battle.enemy.prepare',1,reduced?150:short?200:500,{enemyAct:act,telegraph:b.telegraph,motion:reduced?'fade':'prepare'});
 display('battle.hero.block',hitIndex,0,{blocked:hit.blocked,sources:soft?[soft]:[],motion:'none'});
 add('sound',{cue:'shield',effectIndex:hitIndex,role:'committed'});
 display('battle.hero.hit',hitIndex,0,{hit,motion:'none'});
 const tellIndex=effects.length-1;
 add('sound',{cue:cues[tell.kind],effectIndex:tellIndex,role:'committed'});
 display('battle.nextTell',tellIndex,reduced?150:short?120:350,{telegraph:a.telegraph,motion:reduced?'fade':short?'none':'sway',...(tell.kind==='大技'?{dangerMotion:reduced||short?'still':'pulse'}:{})});
 display('battle.result',effects.length-1,0,{persistent:true,motion:'none'});
 add('controls',{enabled:true,actionsVisible:true});
 return freeze(structuredClone({mode,steps,durationMs:atMs,finalView:after,resultEffects:effects}));
}
