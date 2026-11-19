// One app/document owner, fixed two same-origin resources. No retries or save/audio.
export function createCastleImageCache({createImage,schedule=f=>setTimeout(f,0),isHidden}) {
 const entries=new Map();let disposed=false,epoch=0;
 function entry(key){
  if(!['gate','throne'].includes(key)||disposed)return null;
  if(entries.has(key))return entries.get(key);
  const e={status:'pending',listeners:new Set(),image:null};entries.set(key,e);let loading=true,queued=false,pending=false;
  const finish=valid=>{if(disposed||e.status!=='pending')return;e.status=valid?'ready':'failed';for(const f of [...e.listeners])f();e.listeners.clear()};
  const notify=valid=>{if(loading){if(!queued){queued=true;pending=valid}}else finish(valid)};
  try{const img=createImage();e.image=img;img.onload=()=>notify(img.naturalWidth===402&&img.naturalHeight===(key==='gate'?460:330));img.onerror=()=>notify(false);img.src=new URL(`../../assets/img/bg/${key}.svg`,import.meta.url).href;loading=false;if(queued)finish(pending)}catch{loading=false;finish(false)}
  return e;
 }
 return {
  load(key,ok,bad){const e=entry(key);if(!e){bad();return()=>{}}let active=true;const deliver=()=>{if(!active||disposed)return;if(e.status==='ready')ok({width:402,height:key==='gate'?460:330,image:e.image});else bad()};if(e.status==='pending')e.listeners.add(deliver);else deliver();return()=>{active=false;e.listeners.delete(deliver)}},
  prefetch(view,{home=false,committed=false}={}){const id=++epoch;if(disposed||home||!committed||isHidden()||view?.board?.band?.id!==5||!['board','gate','battle'].includes(view.phase))return;
   schedule(()=>{if(disposed||id!==epoch||isHidden())return;entry('gate');entry('throne')})},
  dispose(){if(disposed)return;disposed=true;epoch++;for(const e of entries.values()){e.listeners.clear();if(e.image){e.image.onload=null;e.image.onerror=null}}}
 };
}
