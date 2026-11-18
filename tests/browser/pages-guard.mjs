// Test-only publication probe guard. Not game code; no remote URLs are accepted.
export function validateBase(value){
 const u=new URL(value);
 if(u.protocol!=='http:'||!['127.0.0.1','localhost'].includes(u.hostname)||!u.port||u.username||u.password||u.search||u.hash||!u.pathname.endsWith('/')||u.pathname.includes('%')) throw new Error('Explicit loopback HTTP port and plain trailing-slash path required');
 return u;
}
export function makePolicy(value,paths){
 const base=validateBase(value),allowed=new Set([base.href]);
 for(const path of paths){
  if(typeof path!=='string'||!path||path.startsWith('/')||path.includes('\\')||path.includes('%')||path.includes('?')||path.includes('#')||path.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error('Unsafe manifest path');
  const u=new URL(path,base);if(u.origin!==base.origin||!u.pathname.startsWith(base.pathname))throw new Error('Resource escapes artifact');allowed.add(u.href);
 }
 return (url,method)=>method==='GET'&&allowed.has(url);
}
export async function installGuard(context,allows,blocked,verifyResponse=null){
 if(typeof context.routeWebSocket!=='function')throw new Error('Context websocket guard required');
 await context.routeWebSocket('**/*',async ws=>{blocked.push({kind:'websocket'});await ws.close();});
 await context.route('**/*',async route=>{
  const request=route.request();
  if(!allows(request.url(),request.method())||request.redirectedFrom()) {blocked.push({kind:'request'});await route.abort('blockedbyclient');return;}
  // Never continue(): route.fetch with maxRedirects=0 prevents an unchecked hop.
  let response;try{response=await route.fetch({maxRedirects:0,maxRetries:0});}catch{blocked.push({kind:'fetch'});await route.abort('blockedbyclient');return;}
  if(response.status()>=300&&response.status()<400){blocked.push({kind:'redirect'});await route.abort('blockedbyclient');return;}
  if(verifyResponse)try{await verifyResponse(request.url(),response.status(),response.headers(),await response.body());}catch{blocked.push({kind:'response'});await route.abort('blockedbyclient');return;}
  await route.fulfill({response});
 });
}
