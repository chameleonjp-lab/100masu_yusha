// Decorates only an already validated castle arrival. No sounds or state changes.
export function appendCastleArrivalUi(plan,settings={}){
 const arrivals=plan?.steps?.filter(s=>s.kind==='display'&&s.payload.stage==='castle.arrive')||[],last=plan?.steps?.at(-1);
 if(arrivals.length!==1||plan.finalView?.phase!=='gate'||plan.finalView.pos!==100||last?.kind!=='controls'||last.payload.enabled!==true||last.atMs!==plan.durationMs)return null;
 const at=arrivals[0].atMs;if(!Number.isSafeInteger(at)||at<0)return null;
 const short=settings.animation==='short',key=arrivals[0].key||'castle-arrival',steps=structuredClone(plan.steps.slice(0,-1));
 for(const [stage,offset,duration] of [['castle.light',short?500:1000,400],['castle.ribbon',short?600:1400,short?200:500],['castle.prepare',short?800:2000,300]])steps.push({kind:'display',key:key+':'+stage,atMs:at+offset,payload:{stage,durationMs:stage==='castle.light'?400:settings.reducedMotion?150:duration,motion:'fade'}});
 const durationMs=Math.max(plan.durationMs,at+(short?1100:2300));steps.push({...structuredClone(last),atMs:durationMs});steps.sort((a,b)=>a.atMs-b.atMs);
 return {...structuredClone(plan),steps,durationMs};
}
