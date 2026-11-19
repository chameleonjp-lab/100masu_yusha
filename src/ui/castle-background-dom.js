import {createBackgroundState} from './castle-background.js';
// Decoration only; image load has no sound/save/timer ownership.
export function mountCastleBackground({host,canvas,sky,document,imageCache=null,createImage=()=>document.createElement('img')}) {
 const layer=document.createElement('div');layer.setAttribute('aria-hidden','true');
 Object.assign(layer.style,{position:'absolute',inset:'0',zIndex:'1',pointerEvents:'none',display:'none',background:'#2A2336'});
 const overlay=document.createElementNS('http://www.w3.org/2000/svg','svg');overlay.setAttribute('viewBox','0 0 402 460');overlay.setAttribute('preserveAspectRatio','xMidYMid meet');
 Object.assign(overlay.style,{position:'absolute',inset:'0',width:'100%',height:'100%',zIndex:'1',pointerEvents:'none',opacity:'0'});
 for(const [x,y]of [[122.2,184],[254.2,184],[188.2,144.4],[87,258.8],[289.4,258.8]]){const r=document.createElementNS('http://www.w3.org/2000/svg','rect');for(const [k,v]of Object.entries({x,y,width:17.6,height:26.4,rx:8.8,fill:'#F4C35A'}))r.setAttribute(k,String(v));overlay.append(r)}
 let image=null;const originalCanvas=canvas.style.visibility,originalSky=sky?.style.visibility;
 host.append(layer);
 const state=createBackgroundState({
  load(key,ok,bad){
   if(imageCache){const surface=document.createElement('canvas');surface.width=402;surface.height=key==='gate'?460:330;Object.assign(surface.style,{position:'absolute',inset:'0',width:'100%',height:'100%',zIndex:'0',objectFit:'contain'});layer.append(surface,overlay);let active=true;
    const stop=imageCache.load(key,data=>{if(!active)return;try{const ctx=surface.getContext('2d');if(!ctx)throw Error('canvas unavailable');ctx.drawImage(data.image,0,0);ok(data)}catch{bad()}},()=>{if(active)bad()});
    return()=>{active=false;stop();surface.remove()};
   }
   const img=createImage();image=img;img.setAttribute('alt','');Object.assign(img.style,{position:'absolute',inset:'0',width:'100%',height:'100%',zIndex:'0',objectFit:'contain'});layer.append(img,overlay);
   img.onload=()=>ok({width:img.naturalWidth,height:img.naturalHeight});img.onerror=()=>bad();
   img.src=new URL(`../../assets/img/bg/${key}.svg`,import.meta.url).href;
   return()=>{img.onload=null;img.onerror=null;img.remove();if(image===img)image=null};
  },
  paint({active,key,windowLight}){layer.style.display=active?'':'none';canvas.style.visibility=active?'hidden':originalCanvas;if(sky)sky.style.visibility=active?'hidden':originalSky;overlay.style.display=key==='gate'?'':'none';overlay.style.opacity=String(windowLight)}
 });
 return {...state,dispose(){state.dispose();layer.remove()}};
}
