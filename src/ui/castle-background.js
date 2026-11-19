// Local decoration contract, not app wiring. Inputs are current committed scene:
// {pos, phase, home, battleKind, battleStage, enemyId}; not saved result history.
export function backgroundKey(scene) {
 if(!scene||typeof scene!=='object'||Array.isArray(scene)||scene.home)return null;
 if(scene.phase==='gate'&&scene.pos===100)return 'gate';
 if(scene.pos===100&&scene.phase==='battle'&&scene.battleKind==='king'&&scene.battleStage==='fight'&&scene.enemyId==='DK01')return 'throne';
 return null;
}
export function createBackgroundState({load,paint}) {
 let key=null,ready=false,disposed=false,generation=0,abort=()=>{},light=0;
 const emit=()=>paint({key,active:!disposed&&ready&&key!==null,windowLight:key==='gate'?light:0});
 const clean=stop=>{try{stop()}catch{/* cleanup cannot interrupt fallback */}};
 const detach=()=>{const stop=abort;abort=()=>{};clean(stop)};
 const current=id=>!disposed&&id===generation;
 return {
  scene(scene){if(disposed)return null;const next=backgroundKey(scene);if(next===key)return generation;
   const id=++generation;key=next;ready=false;light=0;detach();if(!current(id))return null;
   emit();if(!current(id))return null;if(!key)return id;
   const wanted=key;let settled=false,loading=true,queued=false,pending=null;
   const finish=dimensions=>{if(!current(id)||settled)return;settled=true;ready=dimensions?.width===402&&dimensions?.height===(wanted==='gate'?460:330);emit()};
   const complete=dimensions=>{if(!current(id)||settled||queued)return;if(loading){queued=true;pending=dimensions}else finish(dimensions)};
   let stop;
   try{stop=load(wanted,complete,()=>complete(null));}
   catch{loading=false;finish(null);return current(id)?id:null;}
   loading=false;
   if(!current(id)){if(typeof stop==='function')clean(stop);return null;}
   if(typeof stop==='function')abort=stop;
   if(queued)finish(pending);
   return current(id)?id:null;
  },
  // Capture scene token for one arrival subscription; do not reuse after suspend.
  frame(frame,token){if(!current(token))return;light=Math.max(0,Math.min(1,Number(frame?.windowLight)||0));emit()},
  suspend(){if(disposed)return;const id=++generation;key=null;ready=false;light=0;detach();if(!current(id))return;emit()},
  dispose(){if(disposed)return;disposed=true;generation++;detach();ready=false;emit()}
 };
}
