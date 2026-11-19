// Local-only helpers: no socket, browser, install or process spawning.
import assert from 'node:assert/strict';import{createHash}from'node:crypto';
import{makePolicy}from'../pages-guard.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export function seedHook(target,seed){
 assert.ok(Number.isInteger(seed)&&seed>=0&&seed<=0xffffffff,'Uint32 seed required');assert.equal(typeof target.getRandomValues,'function');
 const original=target.getRandomValues;let armed=false,used=0,closed=false;
 function wrapped(value){if(!armed)return original.call(this,value);assert.ok(value instanceof Uint32Array&&value.length===1,'Only session single Uint32 seed allowed while armed');value[0]=seed;used++;armed=false;return value;}
 target.getRandomValues=wrapped;
 return{arm(){assert.ok(!closed&&!armed&&used===0,'Seed hook one-shot only');armed=true;},count:()=>used,restore(){assert.equal(target.getRandomValues,wrapped,'Seed hook replaced by another owner');target.getRandomValues=original;armed=false;closed=true;}};
}
export function responsePlanner({baseURL,raw,expectedPin,resources}){
 const base=new URL(baseURL);assert.equal(base.hostname,'127.0.0.1');assert.ok(['/','/100masu_yusha/'].includes(base.pathname));
 const bytes=Buffer.from(raw);assert.match(expectedPin,/^[a-f0-9]{64}$/);assert.equal(hash(bytes),expectedPin);
 const m=JSON.parse(bytes);assert.equal(m.schema,'yusha100-pages-1');assert.equal(m.status,'preview');assert.equal(m.publicationReady,false);assert.equal(m.labRankingIntegration,false);assert.equal(m.storage?.database,'yusha100-publication-preview-v1');assert.ok(Array.isArray(m.resources));
 const allowed=makePolicy(base.href,[...m.resources.map(r=>r.path),'publication.json']);const data=new Map(),mime={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json; charset=utf-8',svg:'image/svg+xml'};
 for(const r of m.resources){assert.ok(!data.has(r.path)&&r.path!=='publication.json');const extension=r.path.split('.').at(-1);assert.ok(Object.hasOwn(mime,extension),'Unknown MIME');const type=mime[extension];const v=Buffer.from(resources.get(r.path));assert.equal(v.length,r.bytes);assert.equal(hash(v),r.sha256);data.set(r.path,{v,type});}
 assert.ok(data.has('index.html'));assert.equal(resources.size,data.size);data.set('publication.json',{v:bytes,type:mime.json});
 const targets=new Map([...data].map(([p,v])=>[base.pathname+p,v]));targets.set(base.pathname,data.get('index.html'));
 return({target,method,host,peer})=>{const deny={status:403,headers:{'cache-control':'no-store'},body:Buffer.alloc(0)};
 if(peer!=='127.0.0.1'||host!==base.host||method!=='GET'||typeof target!=='string'||!targets.has(target)||!allowed(base.origin+target,method))return deny;
 const d=targets.get(target);return{status:200,headers:{'content-type':d.type,'content-length':String(d.v.length),'cache-control':'no-store','x-content-type-options':'nosniff'},body:Buffer.from(d.v)};};
}
export function adapter(plan){return(req,res)=>{
 if(res.headersSent||res.writableEnded||res.destroyed)return;
 let reply={status:400,headers:{'cache-control':'no-store'},body:Buffer.alloc(0)};
 try{const raw=req.rawHeaders;assert.ok(Array.isArray(raw)&&raw.length%2===0);const hosts=[];for(let i=0;i<raw.length;i+=2){assert.equal(typeof raw[i],'string');assert.equal(typeof raw[i+1],'string');if(raw[i].toLowerCase()==='host')hosts.push(raw[i+1]);}assert.equal(hosts.length,1);
 reply=plan({target:req.url,method:req.method,host:hosts[0],peer:req.socket?.remoteAddress});}catch{}
 try{res.writeHead(reply.status,reply.headers);res.end(reply.body);}catch{try{res.destroy();}catch{}}
};}
