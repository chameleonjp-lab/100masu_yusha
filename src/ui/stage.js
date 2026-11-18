// Actual depth-tested WebGL geometry; no CDN, trackers, or runtime dependencies.
export function cuboid(x,y,z,w,h,d,color){
 const p=[[-w/2,0,-d/2],[w/2,0,-d/2],[w/2,h,-d/2],[-w/2,h,-d/2],[-w/2,0,d/2],[w/2,0,d/2],[w/2,h,d/2],[-w/2,h,d/2]];
 const faces=[[0,1,2,3,.72],[5,4,7,6,.88],[4,0,3,7,.7],[1,5,6,2,.8],[3,2,6,7,1],[4,5,1,0,.6]],a=[];
 for(const [i,j,k,l,shade] of faces)for(const n of [i,j,k,i,k,l])a.push(p[n][0]+x,p[n][1]+y,p[n][2]+z,...color.map(v=>v*shade));return a;
}
export function project(x,y,z){return {x:50+(x*.85-z*.53)/14*100,y:50-(y*.85-(x*.53+z*.85)*.5-.5)/10*100}}
const rgb=h=>h.match(/\w\w/g).map(v=>parseInt(v,16)/255);
export function regionProps(band,{windowLight=0}={}){
 const light=Math.max(0,Math.min(1,Number(windowLight)||0));
 const windowColor=[0x45,0x43,0x57].map((x,i)=>Math.round(x+([0xff,0xd5,0x79][i]-x)*light).toString(16).padStart(2,'0')).join('');
 const a=[],box=(...args)=>a.push(args);
 const tree=(x,z,h,c='67844e')=>{box(x,0,z,.19,.9,.19,'775239');box(x,.65,z,.8,h*.55,.8,c);box(x,1.1,z,.55,h*.35,.55,'88a65e')};
 if(band===1){for(const[x,z,h]of[[-4,-2.5,1.3],[-2.8,-2.8,1.9],[.5,-2.7,1.5],[4,2.5,1.1]])tree(x,z,h);for(const x of[-3,0,3]){box(x,0,-.9,.12,.5,.12,'ac7950');box(x,.3,-.9,.8,.1,.12,'d2ad77')}}
 if(band===2){box(.4,.045,-1.8,8.6,.025,1.8,'66a7b3');for(const x of[-3,-1,1,3])box(x,.075,-1.8,1.2,.012,.045,'b7d5cb');for(const x of[-4,4]){box(x,.04,-1,.1,.9,.1,'547747');box(x+.2,.04,-1.2,.1,1.1,.1,'6b874d')}for(const x of[-2,0,2])box(x,.08,2.4,.7,.3,.55,'b6c3b6')}
 if(band===3){for(const[x,z,h]of[[-3,-2,1.8],[0,-2.7,2.5],[3.1,-1.8,1.9]]){box(x,0,z,1.8,h,1.2,'897969');box(x+.2,h,z,1.1,.4,.8,'ae9c80');box(x-.3,h*.5,z+.65,.35,.35,.2,'b8bcaf')}box(2.5,.1,2.4,2,.1,.1,'5c5147');box(2.5,.1,2.9,2,.1,.1,'5c5147')}
 if(band===4){for(const[x,z,h]of[[-4,-2.5,2],[-2.8,-2.8,2.3],[.5,-2.7,2.5],[4,2.5,1.8]])tree(x,z,h,'505565');for(const[x,z]of[[-3,-1.8],[1,-2.4],[3,2.7]])box(x,.25,z,2,.06,.35,'c5c3cf')}
 if(band===5){box(2.7,.045,-.6,4,.025,.8,'607f98');box(3.1,.08,-.4,.6,.12,1.3,'a7967e');
  box(3.1,0,-1.8,2,1.25,1.1,'afb5b7');
  for(const x of [2.1,4.1]){box(x,0,-1.8,.62,2.1,.8,'c8c8ba');for(const dx of [-.23,.23])box(x+dx,2.1,-1.8,.17,.27,.8,'eee6d1');box(x,1.3,-1.38,.15,.35,.035,windowColor)}
  box(3.1,1.25,-1.95,1,1,.8,'c0c5bd');box(3.1,.02,-1.22,.5,.8,.04,'4b3c42');box(3.1,2.25,-1.95,.07,.8,.07,'604936');box(3.35,2.65,-1.95,.45,.3,.045,'ad4836');

 }
 return a;
}
const regionBand=value=>Math.max(1,Math.min(5,Number(value?.id??value)||1));
const skies=[['cfe8f2','e1eade','f3ebcb'],['bfe0f0','d5eaf0','eaf3ec'],['f2d9a6','f5e2ba','f7ebcf'],['b9b7c9','cbc9d5','dcdce0'],['9b7bb0','e9a07a','f6d9a4']];
export function castleScale(band,pos=0){if(pos>=100)return 1;return regionBand(band)===5&&pos>=95&&pos<=99?1+(pos-95)*.0375:[.22,.36,.52,.70,.92][regionBand(band)-1]}
export function regionFrame(fromBand,band,progress,reduced=false,pos=0){
 const from=regionBand(fromBand),to=regionBand(band),t=Math.max(0,Math.min(1,progress));
 const sky=skies[to-1].map((color,i)=>'rgb('+rgb(color).map((v,j)=>Math.round((rgb(skies[from-1][i])[j]*(1-t)+v*t)*255)).join(',')+')');
 return {castleMix:reduced?{fromScale:castleScale(from),toScale:castleScale(to,pos),progress:t}:null,background:'linear-gradient(180deg,'+sky.join(',')+')',scale:reduced?castleScale(to,pos):castleScale(from)+(castleScale(to,pos)-castleScale(from))*(1-(1-t)**3)};
}
// Pure animation owner. No sound, persistence, asset loading or game state.
export function createCastleArrival({now,request,cancel,onFrame}){
 let key=null,generation=0,disposed=false,reduced=false,state={cameraY:0,windowLight:0};const seen=new Set(),jobs=new Map(),done=new Set();
 const emit=()=>onFrame({...state});
 const clear=()=>{generation++;for(const id of jobs.values())cancel(id);jobs.clear()};
 const settle=()=>{clear();state={cameraY:reduced?0:.55,windowLight:1};done.add('look');done.add('light');emit()};
 const api={command({type,key:next,short=false,reducedMotion=false}={}){
  if(disposed||typeof next!=='string'||!next)return {cancel(){}};
  if(type==='look'){
   if(seen.has(next))return {cancel(){}};clear();key=next;seen.add(next);done.clear();reduced=!!reducedMotion;state={cameraY:0,windowLight:0};emit();
  }else if(type==='finish'&&key===null){key=next;seen.add(next);reduced=!!reducedMotion;}else if(key!==next)return {cancel(){}};
  const id=generation;
  if(type==='finish'||type==='cancel'){settle();return {cancel(){}}}
  if(!['look','light'].includes(type)||done.has(type)||jobs.has(type))return {cancel(){}};
  const duration=type==='look'?(reduced?0:short?400:800):400,start=now();
  const tick=t=>{if(disposed||id!==generation)return;const f=duration?Math.max(0,Math.min(1,(t-start)/duration)):1;
   if(type==='look')state.cameraY=reduced?0:.55*(1-(1-f)**3);else state.windowLight=f;emit();
   if(f<1)jobs.set(type,request(tick));else{jobs.delete(type);done.add(type)}
  };if(duration)jobs.set(type,request(tick));else tick(start);
  return {cancel(){if(!disposed&&id===generation&&key===next&&!done.has(type)&&jobs.has(type))settle()}};
 },setFinal(reducedMotion=false){if(disposed)return;clear();key=null;reduced=!!reducedMotion;state={cameraY:reduced?0:.55,windowLight:1};emit()},finish(){if(!disposed&&key)settle()},reset(){if(disposed)return;clear();key=null;done.clear();state={cameraY:0,windowLight:0};emit()},dispose(){if(disposed)return;clear();disposed=true}};return api;
}
export function createStage(canvas,onUnavailable=()=>{}){
 let gl,program,buffer,raf=0,disposed=false,scene={band:1},generation=0;
 let targets=null,mixProgram=null,mixBuffer=null,fadeUnavailable=false;
 let arrivalFrame={cameraY:0,windowLight:0};
 const arrival=createCastleArrival({now:()=>performance.now(),request:f=>requestAnimationFrame(f),cancel:id=>cancelAnimationFrame(id),onFrame:frame=>{arrivalFrame=frame;draw()}});
 let region=null,regionRaf=0,regionGeneration=0,visual=regionFrame(1,1,1);
 const vs='uniform float cameraY;attribute vec3 p;attribute vec3 c;varying vec3 color;void main(){float x=p.x*.85-p.z*.53;float z=p.x*.53+p.z*.85;gl_Position=vec4(x/7.,(p.y*.85-z*.5-.5-cameraY)/5.,-(z*.85+p.y*.5)/30.,1.);color=c;}';
 const fs='precision mediump float;varying vec3 color;void main(){gl_FragColor=vec4(color,1.);}';
 function releaseBase(){if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);buffer=null;program=null;}
 function init(){
  gl=canvas.getContext('webgl',{alpha:true,antialias:true,preserveDrawingBuffer:false});if(!gl){onUnavailable();return false}
  const shaders=[];let nextProgram=null,nextBuffer=null;
  try{
   for(const [kind,source] of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]){const shader=gl.createShader(kind);if(!shader)throw Error('3D shader');shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error('3D shader');}
   nextProgram=gl.createProgram();if(!nextProgram)throw Error('3D program');shaders.forEach(shader=>gl.attachShader(nextProgram,shader));gl.linkProgram(nextProgram);if(!gl.getProgramParameter(nextProgram,gl.LINK_STATUS))throw Error('3D program');nextBuffer=gl.createBuffer();if(!nextBuffer)throw Error('3D buffer');program=nextProgram;buffer=nextBuffer;return true;
  }catch(error){if(nextBuffer)gl.deleteBuffer(nextBuffer);if(nextProgram)gl.deleteProgram(nextProgram);program=null;buffer=null;throw error;}finally{shaders.forEach(shader=>gl.deleteShader(shader));}
 }
 function geometry(angle=0,castleSize=visual.scale){
  const a=[],ground=['91ae73','6b9e94','a89778','7b7189','5d637c'][Math.max(0,Math.min(4,scene.band-1))];
  const box=(x,y,z,w,h,d,c)=>a.push(...cuboid(x,y,z,w,h,d,rgb(c)));
  box(0,-.8,0,10,.7,7,'aa8057');box(0,-.12,0,10,.16,7,ground);
  // Terraced river and stepping-stone road; every block has thickness.
  for(let i=0;i<9;i++){
   const x=-4+i,z=1.5-Math.sin(i*.55)*1.2;
   box(x,.04,z,.86,.19,.95,i===2?'f4b942':'eee1bb');
   if(i%2===0)box(x,.24,z,.55,.012,.07,'c1aa80');
  }
  const props=regionProps(scene.band);
  for(const prop of (scene.band===5?props.slice(0,2):props))box(...prop);
  // Keep the distant castle anchored at the horizon in every region.
  for(const [x,y,z,w,h,d,c] of regionProps(5,{windowLight:arrivalFrame.windowLight}).slice(2)){
   const k=castleSize;box(3.1+(x-3.1)*k,y*k,-1.8+(z+1.8)*k,w*k,h*k,d*k,c);
  }
  if(scene.die){
   const dice=cuboid(0,0,0,1,1,1,rgb('fffae9'));
   const c=Math.cos(angle),s=Math.sin(angle);
   for(let i=0;i<dice.length;i+=6){const x=dice[i],y=dice[i+1]-.5,z=dice[i+2];dice[i]=x*c-z*s;dice[i+1]=y+.8+Math.abs(Math.sin(angle))*1.1;dice[i+2]=x*s+z*c+1}
   a.push(...dice);
   // Visible top pips encode the committed roll (the DOM repeats the value).
   const patterns={1:[[0,0]],2:[[-.24,-.24],[.24,.24]],3:[[-.24,-.24],[0,0],[.24,.24]],4:[[-.24,-.24],[.24,-.24],[-.24,.24],[.24,.24]],5:[[-.24,-.24],[.24,-.24],[0,0],[-.24,.24],[.24,.24]],6:[[-.24,-.24],[-.24,0],[-.24,.24],[.24,-.24],[.24,0],[.24,.24]]};
   if(!angle)for(const [x,z] of patterns[scene.die]||[])box(x,1.31,z+1,.12,.018,.12,'3b3029');
  }return a;
 }

 function releaseTargets(){
  if(targets){for(const t of targets.layers){gl.deleteTexture(t.texture);gl.deleteRenderbuffer(t.depth);gl.deleteFramebuffer(t.framebuffer);}targets=null;}
 }
 function releaseMix(){releaseTargets();if(mixBuffer)gl.deleteBuffer(mixBuffer);if(mixProgram)gl.deleteProgram(mixProgram);mixBuffer=null;mixProgram=null;}
 function ensureMix(w,h){
  if(!mixProgram){
   const shaders=[];let pendingProgram=null,pendingBuffer=null;
   try{
    for(const [kind,source] of [[gl.VERTEX_SHADER,'attribute vec2 position;varying vec2 uv;void main(){uv=(position+1.)*.5;gl_Position=vec4(position,0.,1.);}'],[gl.FRAGMENT_SHADER,'precision mediump float;varying vec2 uv;uniform sampler2D oldScene;uniform sampler2D newScene;uniform float weight;void main(){gl_FragColor=mix(texture2D(oldScene,uv),texture2D(newScene,uv),weight);}']]){
     const shader=gl.createShader(kind);if(!shader)throw Error('castle shader');shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error('castle shader');
    }
    pendingProgram=gl.createProgram();if(!pendingProgram)throw Error('castle program');shaders.forEach(shader=>gl.attachShader(pendingProgram,shader));gl.linkProgram(pendingProgram);if(!gl.getProgramParameter(pendingProgram,gl.LINK_STATUS))throw Error('castle program');
    pendingBuffer=gl.createBuffer();if(!pendingBuffer)throw Error('castle quad');gl.bindBuffer(gl.ARRAY_BUFFER,pendingBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    mixProgram=pendingProgram;mixBuffer=pendingBuffer;
   }catch(error){if(pendingBuffer)gl.deleteBuffer(pendingBuffer);if(pendingProgram)gl.deleteProgram(pendingProgram);throw error;}finally{shaders.forEach(shader=>gl.deleteShader(shader));}
  }
  if(targets&&targets.w===w&&targets.h===h)return;
  releaseTargets();targets={w,h,layers:[]};
  try{for(let i=0;i<2;i++){
   const layer={texture:gl.createTexture(),depth:gl.createRenderbuffer(),framebuffer:gl.createFramebuffer()};targets.layers.push(layer);if(!layer.texture||!layer.depth||!layer.framebuffer)throw Error('castle target');
   gl.bindTexture(gl.TEXTURE_2D,layer.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
   gl.bindRenderbuffer(gl.RENDERBUFFER,layer.depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,w,h);gl.bindFramebuffer(gl.FRAMEBUFFER,layer.framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,layer.texture,0);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,layer.depth);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('castle framebuffer');
  }}catch(error){releaseTargets();throw error;}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindTexture(gl.TEXTURE_2D,null);gl.bindRenderbuffer(gl.RENDERBUFFER,null);}
 }
 function scenePass(angle,scale,w,h,framebuffer=null){
  gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.viewport(0,0,w,h);gl.colorMask(true,true,true,true);gl.depthMask(true);gl.disable(gl.BLEND);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.useProgram(program);gl.uniform1f(gl.getUniformLocation(program,'cameraY'),arrivalFrame.cameraY);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);const data=new Float32Array(geometry(angle,scale));gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
  for(const [name,offset] of [['p',0],['c',12]]){const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,24,offset);}gl.drawArrays(gl.TRIANGLES,0,data.length/6);
 }
 function draw(angle=0){if(disposed||!gl||!program||!buffer||gl.isContextLost()||document.hidden)return;
  const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
  const mix=visual.castleMix;
  if(mix&&mix.progress>0&&mix.progress<1&&!fadeUnavailable){
   try{
    ensureMix(w,h);
    // Each image is rendered opaque with its own depth. Only castle scale differs.
    // Transparent background is premultiplied (zero RGB), so linear RGBA mix
    // preserves full coverage at shared pixels and never stacks cuboid faces.
    scenePass(angle,mix.fromScale,w,h,targets.layers[0].framebuffer);scenePass(angle,mix.toScale,w,h,targets.layers[1].framebuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.useProgram(mixProgram);gl.bindBuffer(gl.ARRAY_BUFFER,mixBuffer);
    const loc=gl.getAttribLocation(mixProgram,'position');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,8,0);
    for(let i=0;i<2;i++){gl.activeTexture(i?gl.TEXTURE1:gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,targets.layers[i].texture);gl.uniform1i(gl.getUniformLocation(mixProgram,i?'newScene':'oldScene'),i);}
    gl.uniform1f(gl.getUniformLocation(mixProgram,'weight'),mix.progress);gl.drawArrays(gl.TRIANGLES,0,6);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,null);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,null);gl.enable(gl.DEPTH_TEST);return;
   }catch{fadeUnavailable=true;releaseMix();gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.activeTexture(gl.TEXTURE0);}
  }
  releaseTargets();scenePass(angle,mix&&mix.progress===0&&!fadeUnavailable?mix.fromScale:visual.scale,w,h);
 }
 function paintRegion(progress=1){
  visual=region?regionFrame(region.from,region.to,progress,region.reduced,scene.pos):regionFrame(scene.band,scene.band,1,false,scene.pos);
  canvas.style.background=visual.background;
 }
 function cancelTransition(){
  if(disposed)return;
  cancelAnimationFrame(regionRaf);regionGeneration++;
  if(region){scene={...scene,band:region.to};paintRegion(1);region=null;releaseTargets();}else paintRegion();
  draw();
 }
 function transitionRegion({fromBand,band,durationMs=1200,reducedMotion=false}={}){
  if(disposed)return {cancel(){}};
  cancelTransition();const to=regionBand(band),from=regionBand(fromBand);
  region={from,to,reduced:reducedMotion};scene={...scene,band:to};
  const duration=reducedMotion?300:Math.max(0,Number(durationMs)||0),start=performance.now(),id=regionGeneration;
  paintRegion(0);draw();
  const tick=t=>{if(disposed||id!==regionGeneration)return;if(document.hidden){cancelTransition();return}
   const f=duration?Math.min(1,Math.max(0,(t-start)/duration)):1;paintRegion(f);draw();
   if(f<1)regionRaf=requestAnimationFrame(tick);else {region=null;regionRaf=0;}
  };
  if(document.hidden||!duration)cancelTransition();else regionRaf=requestAnimationFrame(tick);
  return {cancel(){if(region&&id===regionGeneration)cancelTransition()}};
 }
 function stop(){cancelAnimationFrame(raf);generation++}
 function visibility(){arrival.finish();stop();cancelTransition();if(!document.hidden)draw()}
 function lost(e){e.preventDefault();arrival.finish();stop();cancelTransition();releaseMix();releaseBase();onUnavailable('lost')}
 function restored(){if(disposed)return;fadeUnavailable=false;try{if(init()){onUnavailable('restored');draw()}else onUnavailable()}catch{onUnavailable()}}
 canvas.addEventListener('webglcontextlost',lost);canvas.addEventListener('webglcontextrestored',restored);document.addEventListener('visibilitychange',visibility);
 const observer=new ResizeObserver(()=>draw());observer.observe(canvas);try{init()}catch{onUnavailable()}
 return {arrivalVisual:options=>{if(document.hidden){arrival.command(options);arrival.finish();return {cancel(){}}}return arrival.command(options)},transitionRegion,cancelTransition,update(next,animate=false){if(disposed)return;if(next.phase==='gate'&&next.pos===100)arrival.setFinal(next.reducedMotion);else arrival.reset();stop();if(region&&regionBand(next.band)!==region.to)cancelTransition();scene=next;if(!region)paintRegion();draw();if(animate&&next.die){const start=performance.now(),id=generation;const tick=t=>{if(disposed||document.hidden||generation!==id)return;const f=Math.min(1,(t-start)/650);draw((1-f)*Math.PI*4);if(f<1)raf=requestAnimationFrame(tick)};raf=requestAnimationFrame(tick)}},dispose(){if(disposed)return;arrival.dispose();stop();cancelAnimationFrame(regionRaf);regionGeneration++;region=null;disposed=true;releaseMix();observer.disconnect();document.removeEventListener('visibilitychange',visibility);canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('webglcontextrestored',restored);if(gl)releaseBase()}};
}
