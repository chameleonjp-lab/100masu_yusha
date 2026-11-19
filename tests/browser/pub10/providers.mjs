// Import/factory are inert. Calling a provider requires a separately permitted runtime.
import nodeHttp from'node:http';import assert from'node:assert/strict';
export function createProviders({chromium,executablePath,http=nodeHttp}){
 assert.equal(typeof chromium?.launch,'function','Existing Playwright Chromium required; stop, do not install');assert.ok(typeof executablePath==='string'&&executablePath.startsWith('/')&&!executablePath.includes('\0'),'Verified existing absolute browser path required');
 return Object.freeze({
 launchBrowser:()=>chromium.launch({executablePath,headless:true,chromiumSandbox:true,timeout:30000}),
 async startServer({host,port,handler}){
  assert.equal(host,'127.0.0.1');assert.ok(Number.isInteger(port)&&port>0&&port<=65535);assert.equal(typeof handler,'function');
  const server=http.createServer({requestTimeout:10000,headersTimeout:10000},handler);
  await new Promise((resolve,reject)=>{let settled=false;const fail=error=>{if(settled)return;settled=true;try{server.close();}catch{}reject(error);};server.once('error',fail);server.once('listening',()=>{if(settled)return;settled=true;resolve();});try{server.listen({host,port,exclusive:true});}catch(error){fail(error);}});
  return Object.freeze({address:()=>server.address(),close:()=>new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections?.();})});
 }
 });
}
