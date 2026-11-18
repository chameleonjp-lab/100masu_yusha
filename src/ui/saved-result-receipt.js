// Evidence for this tab's successful act/readback only. Never call with reconstructed
// before-state on reload. This is not a persistence, authenticity or cross-tab lock.
import {applyRunToMeta} from '../engine/results.js';
const groups=['enemies','companions','gear'];
function json(value,seen=new Set()){
 if(value===null||typeof value==='string'||typeof value==='boolean')return true;
 if(typeof value==='number')return Number.isFinite(value);
 if(!value||typeof value!=='object'||seen.has(value))return false;
 const proto=Object.getPrototypeOf(value);if(!Array.isArray(value)&&proto!==Object.prototype&&proto!==null)return false;
 seen.add(value);
 const descriptors=Object.getOwnPropertyDescriptors(value);
 const keys=Reflect.ownKeys(descriptors);
 if(keys.some(k=>typeof k!=='string'||(k!=='length'&&(!descriptors[k].enumerable||!('value' in descriptors[k])))))return false;
 if(Array.isArray(value)&&(keys.length!==value.length+1||Array.from({length:value.length},(_,i)=>String(i)).some(k=>!Object.hasOwn(descriptors,k))))return false;
 const ok=Object.keys(value).every(k=>json(descriptors[k].value,seen));seen.delete(value);return ok;
}
function equal(a,b){
 if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const ak=Object.keys(a),bk=Object.keys(b);return ak.length===bk.length&&ak.every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]));
}
const list=a=>Array.isArray(a)&&a.every(x=>typeof x==='string'&&x.length>0)&&new Set(a).size===a.length;
const discoveries=d=>d&&Object.keys(d).length===3&&groups.every(k=>list(d[k]));
function meta(m){return m&&m.metaVersion===1&&discoveries(m.dex)&&list(m.recordedRuns)&&m.bests&&typeof m.bests==='object'&&!Array.isArray(m.bests)&&m.settings&&typeof m.settings==='object'&&!Array.isArray(m.settings);}
function result(r,run){return r===null||r===undefined||
 (r&&r.runId===run.runId&&r.route===run.route&&typeof r.defeated==='boolean'&&Number.isSafeInteger(r.furthest)&&r.furthest>=1&&r.furthest<=100&&Number.isSafeInteger(r.rolls)&&r.rolls>=0);}
/** Null means evidence is absent/uncertain. An empty receipt means confirmed but no cue.
 * Snapshot beforeRun/beforeMeta before act and afterRun/afterMeta synchronously after
 * successful act. Consume returned key once even when hidden, muted or skipped.
 */
export function validateSavedResultReceipt(input){
 try{
  if(!json(input))return null;
  const {beforeRun:b,beforeMeta:bm,afterRun:a,afterMeta:am,status,effects}=input;
  if(status!=='ok'||!b||!a||!meta(bm)||!meta(am)||!Array.isArray(effects)||!effects.length)return null;
  if(effects.some(e=>!e||typeof e!=='object'||Array.isArray(e)||typeof e.t!=='string'||!e.t))return null;
  if(typeof b.runId!=='string'||!b.runId||a.runId!==b.runId||!Number.isSafeInteger(b.revision)||b.revision<0||a.revision!==b.revision+1||!Number.isSafeInteger(a.revision))return null;
  if(!['M','F','B','H'].includes(b.route)||a.route!==b.route||!discoveries(b.discovered)||!discoveries(a.discovered)||!result(a.result,a))return null;
  if(groups.some(k=>b.discovered[k].some(id=>!a.discovered[k].includes(id))))return null;
  if(b.result&&!equal(b.result,a.result))return null;
  const finishes=effects.filter(e=>e?.t==='runFinished');
  if(finishes.length>1||finishes.some(e=>!a.result||!equal(e.result,a.result)))return null;
  if(a.result&&!b.result&&finishes.length!==1)return null;
  const last={runId:a.runId,revision:a.revision,effects};
  if(!equal(am.uiLastResult,last))return null;
  const merged=applyRunToMeta(bm,a);merged.meta.uiLastResult=last;
  if(!equal(merged.meta,am))return null;
  return JSON.parse(JSON.stringify({runId:a.runId,revision:a.revision,key:`${a.runId}:${a.revision}`,recorded:merged.recorded,newBest:merged.newBest,discoveries:merged.discoveries,discoveryCount:groups.reduce((n,k)=>n+merged.discoveries[k].length,0),result:a.result??null}));
 }catch{return null;}
}
