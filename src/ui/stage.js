// Actual depth-tested WebGL geometry; no CDN, trackers, or runtime dependencies.
export function cuboid(x,y,z,w,h,d,color){
 const p=[[-w/2,0,-d/2],[w/2,0,-d/2],[w/2,h,-d/2],[-w/2,h,-d/2],[-w/2,0,d/2],[w/2,0,d/2],[w/2,h,d/2],[-w/2,h,d/2]];
 const faces=[[0,1,2,3,.72],[5,4,7,6,.88],[4,0,3,7,.7],[1,5,6,2,.8],[3,2,6,7,1],[4,5,1,0,.6]],a=[];
 for(const [i,j,k,l,shade] of faces)for(const n of [i,j,k,i,k,l])a.push(p[n][0]+x,p[n][1]+y,p[n][2]+z,...color.map(v=>v*shade));return a;
}
export function project(x,y,z){return {x:50+(x*.85-z*.53)/14*100,y:50-(y*.85-(x*.53+z*.85)*.5-.5)/10*100}}
const rgb=h=>h.match(/\w\w/g).map(v=>parseInt(v,16)/255);
export function regionProps(band){
 const a=[],box=(...args)=>a.push(args);
 const tree=(x,z,h,c='67844e')=>{box(x,0,z,.19,.9,.19,'775239');box(x,.65,z,.8,h*.55,.8,c);box(x,1.1,z,.55,h*.35,.55,'88a65e')};
 if(band===1){for(const[x,z,h]of[[-4,-2.5,1.3],[-2.8,-2.8,1.9],[.5,-2.7,1.5],[4,2.5,1.1]])tree(x,z,h);for(const x of[-3,0,3]){box(x,0,-.9,.12,.5,.12,'ac7950');box(x,.3,-.9,.8,.1,.12,'d2ad77')}}
 if(band===2){box(.4,.045,-1.8,8.6,.025,1.8,'66a7b3');for(const x of[-3,-1,1,3])box(x,.075,-1.8,1.2,.012,.045,'b7d5cb');for(const x of[-4,4]){box(x,.04,-1,.1,.9,.1,'547747');box(x+.2,.04,-1.2,.1,1.1,.1,'6b874d')}for(const x of[-2,0,2])box(x,.08,2.4,.7,.3,.55,'b6c3b6')}
 if(band===3){for(const[x,z,h]of[[-3,-2,1.8],[0,-2.7,2.5],[3.1,-1.8,1.9]]){box(x,0,z,1.8,h,1.2,'897969');box(x+.2,h,z,1.1,.4,.8,'ae9c80');box(x-.3,h*.5,z+.65,.35,.35,.2,'b8bcaf')}box(2.5,.1,2.4,2,.1,.1,'5c5147');box(2.5,.1,2.9,2,.1,.1,'5c5147')}
 if(band===4){for(const[x,z,h]of[[-4,-2.5,2],[-2.8,-2.8,2.3],[.5,-2.7,2.5],[4,2.5,1.8]])tree(x,z,h,'505565');for(const[x,z]of[[-3,-1.8],[1,-2.4],[3,2.7]])box(x,.25,z,2,.06,.35,'c5c3cf')}
 if(band===5){box(2.7,.045,-.6,4,.025,.8,'607f98');box(3.1,.08,-.4,.6,.12,1.3,'a7967e');
  box(3.1,0,-1.8,2,1.25,1.1,'afb5b7');
  for(const x of [2.1,4.1]){box(x,0,-1.8,.62,2.1,.8,'c8c8ba');for(const dx of [-.23,.23])box(x+dx,2.1,-1.8,.17,.27,.8,'eee6d1');box(x,1.3,-1.38,.15,.35,.035,'454357')}
  box(3.1,1.25,-1.95,1,1,.8,'c0c5bd');box(3.1,.02,-1.22,.5,.8,.04,'4b3c42');box(3.1,2.25,-1.95,.07,.8,.07,'604936');box(3.35,2.65,-1.95,.45,.3,.045,'ad4836');

 }
 return a;
}
export function createStage(canvas,onUnavailable=()=>{}){
 let gl,program,buffer,raf=0,disposed=false,scene={band:1},generation=0;
 const vs='attribute vec3 p;attribute vec3 c;varying vec3 color;void main(){float x=p.x*.85-p.z*.53;float z=p.x*.53+p.z*.85;gl_Position=vec4(x/7.,(p.y*.85-z*.5-.5)/5.,-(z*.85+p.y*.5)/30.,1.);color=c;}';
 const fs='precision mediump float;varying vec3 color;void main(){gl_FragColor=vec4(color,1.);}';
 function init(){
  gl=canvas.getContext('webgl',{alpha:true,antialias:true,preserveDrawingBuffer:false});if(!gl){onUnavailable();return false}
  function shader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('3D shader');return s}
  program=gl.createProgram();const shaders=[shader(gl.VERTEX_SHADER,vs),shader(gl.FRAGMENT_SHADER,fs)];shaders.forEach(s=>gl.attachShader(program,s));gl.linkProgram(program);shaders.forEach(s=>gl.deleteShader(s));if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('3D program');buffer=gl.createBuffer();return true;
 }
 function geometry(angle=0){
  const a=[],ground=['91ae73','6b9e94','a89778','7b7189','5d637c'][Math.max(0,Math.min(4,scene.band-1))];
  const box=(x,y,z,w,h,d,c)=>a.push(...cuboid(x,y,z,w,h,d,rgb(c)));
  box(0,-.8,0,10,.7,7,'aa8057');box(0,-.12,0,10,.16,7,ground);
  // Terraced river and stepping-stone road; every block has thickness.
  for(let i=0;i<9;i++){
   const x=-4+i,z=1.5-Math.sin(i*.55)*1.2;
   box(x,.04,z,.86,.19,.95,i===2?'f4b942':'eee1bb');
   if(i%2===0)box(x,.24,z,.55,.012,.07,'c1aa80');
  }
  for(const prop of regionProps(scene.band))box(...prop);
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
 function draw(angle=0){if(disposed||!gl||gl.isContextLost()||document.hidden)return;
  const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);const w=Math.round(r.width*dpr),h=Math.round(r.height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
  gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);const data=new Float32Array(geometry(angle));gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
  for(const [name,offset] of [['p',0],['c',12]]){const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,24,offset)}gl.drawArrays(gl.TRIANGLES,0,data.length/6);
 }
 function stop(){cancelAnimationFrame(raf);generation++}
 function visibility(){stop();if(!document.hidden)draw()}
 function lost(e){e.preventDefault();stop();onUnavailable('lost')}
 function restored(){try{if(init()){onUnavailable('restored');draw()}else onUnavailable()}catch{onUnavailable()}}
 canvas.addEventListener('webglcontextlost',lost);canvas.addEventListener('webglcontextrestored',restored);document.addEventListener('visibilitychange',visibility);
 const observer=new ResizeObserver(()=>draw());observer.observe(canvas);try{init()}catch{onUnavailable()}
 return {update(next,animate=false){stop();scene=next;draw();if(animate&&next.die){const start=performance.now(),id=generation;const tick=t=>{if(disposed||document.hidden||generation!==id)return;const f=Math.min(1,(t-start)/650);draw((1-f)*Math.PI*4);if(f<1)raf=requestAnimationFrame(tick)};raf=requestAnimationFrame(tick)}},dispose(){stop();disposed=true;observer.disconnect();document.removeEventListener('visibilitychange',visibility);canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('webglcontextrestored',restored);if(gl){gl.deleteBuffer(buffer);gl.deleteProgram(program)}}};
}
