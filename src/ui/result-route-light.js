// Pure presentation for the committed end of a king run. No gameplay or store ownership.
const routes=['M','F','B','H'];
const resultKeys=['runId','route','defeated','endedBy','furthest','rolls','level','job','companions','lostTo','pos'];
const nn=n=>Number.isSafeInteger(n)&&n>=0;
const text=x=>typeof x==='string'&&x.length>0;
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x};
const sameList=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&Array.from(a).every((x,i)=>text(x)&&x===b[i]);
const routeMap=(routeId,litBands)=>({routeId,litBands,segments:Array.from({length:5},(_,i)=>({band:i+1,from:i*20+1,to:(i+1)*20,lit:i<litBands}))});
const heroMatchesResult=(v,r)=>v.hero?.level===r.level&&v.hero?.job?.id===r.job&&Array.isArray(v.hero?.companions)&&sameList(r.companions,v.hero.companions.map(c=>c?.id));
function isCompleted(v){
 const r=v?.result,w=v?.victory;
 return v?.phase==='finished'&&v.battle===null&&v.reward===null&&v.prompt==null&&v.event==null&&
  text(v.runId)&&nn(v.revision)&&v.pos===100&&v.furthest===100&&nn(v.rolls)&&
  w?.enemyId==='DK01'&&w.pos===100&&w.rolls===v.rolls&&nn(w.battleId)&&
  !!r&&Object.keys(r).length===resultKeys.length&&resultKeys.every(k=>Object.hasOwn(r,k))&&
  r.defeated===true&&r.endedBy==='victory'&&r.lostTo===null&&r.runId===v.runId&&
  routes.includes(r.route)&&r.route===v.route?.id&&r.pos===100&&r.furthest===100&&r.rolls===v.rolls&&
  nn(r.level)&&r.level>0&&text(r.job)&&heroMatchesResult(v,r);
}
// Use for rendered saved results even on reload, never as a reason to schedule a plan.
export function completedKingRouteMap(view){
 return isCompleted(view)?freeze(routeMap(view.route.id,5)):null;
}
export function planResultRouteLight(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return null;
 const {before,after,effects,settings={}}=input,r=after?.result,b=before?.battle,w=before?.victory;
 if(!settings||typeof settings!=='object'||Array.isArray(settings)||!isCompleted(after)||
  before?.phase!=='battleReward'||before.prompt!=null||before.result!=null||before.runId!==after.runId||!nn(before.revision)||after.revision!==before.revision+1||
  before.route?.id!==r.route||before.pos!==100||before.furthest!==100||before.rolls!==r.rolls||
  b?.kind!=='king'||b.stage!=='won'||!nn(b.id)||b.enemy?.id!=='DK01'||b.enemy.hp!==0||
  w?.enemyId!=='DK01'||w.pos!==100||w.rolls!==before.rolls||w.battleId!==b.id||w.battleId!==after.victory.battleId||
  before.reward?.enemyId!=='DK01'||before.reward.victory!==true||
  !heroMatchesResult(before,r)||!['hp','mp','level','xp','gold','maxHp','maxMp'].every(k=>nn(before.hero[k])&&after.hero[k]===before.hero[k])||
  !Array.isArray(effects)||effects.length!==1)return null;
 const e=effects[0],actual=e?.result;
 if(e?.t!=='runFinished'||Object.keys(e).length!==2||!actual||Object.keys(actual).length!==resultKeys.length||
  resultKeys.some(k=>k==='companions'?!sameList(actual[k],r[k]):!Object.hasOwn(actual,k)||actual[k]!==r[k]))return null;
 const mode='result-route-light',reduced=!!settings.reducedMotion,ms=reduced?0:settings.animation==='short'?100:300,durationMs=ms*5;
 const steps=[],add=(kind,atMs,payload)=>steps.push({key:`${after.runId}:${after.revision}:${mode}:${steps.length}`,atMs,kind,payload});
 add('controls',0,{enabled:false,actionsVisible:true});
 for(const count of reduced?[5]:[1,2,3,4,5])
  add('display',reduced?0:(count-1)*ms,{...routeMap(r.route,count),stage:'result.route.light',durationMs:ms,motion:reduced?'none':'light',effectIndex:0});
 add('controls',durationMs,{enabled:true,actionsVisible:true});
 return freeze(structuredClone({mode,durationMs,finalView:after,resultEffects:effects,steps}));
}
