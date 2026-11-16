// Offline T09 verifier prototype. No fetch, storage endpoint, production registration or score submission.
import {createRun,dispatch} from '../engine/index.js';
import {RULES_VERSION} from '../engine/state.js';
import {compareResults} from '../engine/results.js';
import {clone,fail} from '../engine/util.js';
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
async function digest(v){const bytes=new TextEncoder().encode(canonical(v));const h=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('');}
// Hash the complete assembled gameplay payload, including applied encounter patches.
export const contentDigest=content=>digest(content);
export function japanDate(now){const d=new Date(now);if(!Number.isFinite(d.getTime()))fail('bad_start_time');return new Date(d.getTime()+9*3600000).toISOString().slice(0,10);}
function plainRun(s){const out=clone(s);delete out.ranking;return out;}
export function dailyDispatch(content,state,action,requestId){
 if(!state.ranking||state.ranking.ticket.mode!=='daily')fail('not_daily');
 if(typeof requestId!=='string'||!requestId.trim())fail('request_id_required');
 const payload=clone(action);delete payload.opId;
 const previous=state.ranking.operations.find(x=>x.requestId===requestId);
 if(previous){if(canonical(previous.action)!==canonical(payload))fail('request_id_conflict');return {state,effects:[],replay:true};}
 const sequence=state.ranking.operations.length+1,opId=`${state.runId}:${sequence}`;
 const result=dispatch(content,state,{...payload,opId});
 result.state.ranking.operations.push({sequence,requestId,action:payload});
 return result;
}
/** Local-only stand-in for a trusted receiver. The production service must own this authority, never the browser. */
export async function createLocalRankingAuthority(content){
 // Detach synchronously before the first await: caller mutations cannot change issued rules.
 content=clone(content);
 const hash=await contentDigest(content),tickets=new Map(),accepted=new Map();
 return {
  async start({runId,participantId,name,route,now}){
   if(tickets.has(runId))fail('duplicate_run');
   if(typeof participantId!=='string'||!participantId.trim())fail('participant_required');
   const day=japanDate(now),cohort=[day,route,RULES_VERSION,hash].join('|');
   const seed=parseInt((await digest(cohort)).slice(0,8),16);
   const safeName=typeof name==='string'?name.trim():'';
   const ticket={runId,participantId,name:safeName,eligible:!!safeName,route,day,cohort,seed,rulesVersion:RULES_VERSION,contentHash:hash,mode:'daily'};
   // No await between the second check and registration: concurrent requests cannot replace a ticket.
   if(tickets.has(runId))fail('duplicate_run');
   const run=createRun(content,{runId,route,seed});
   tickets.set(runId,clone(ticket));run.ranking={ticket,operations:[],submission:{status:'unsent',attempts:0}};return run;
  },
  accept(submitted){
   const ticket=tickets.get(submitted?.runId);if(!ticket||!ticket.eligible)fail('unregistered_start');
   if(canonical(ticket)!==canonical(submitted.ranking?.ticket))fail('start_mismatch');
   if(!Array.isArray(submitted.ranking.operations))fail('missing_operations');
   let replay=createRun(content,{runId:ticket.runId,route:ticket.route,seed:ticket.seed});
   const seen=new Set();
   for(let i=0;i<submitted.ranking.operations.length;i++){
    const op=submitted.ranking.operations[i];if(op.sequence!==i+1||typeof op.requestId!=='string'||!op.requestId.trim()||seen.has(op.requestId))fail('bad_operation_sequence');seen.add(op.requestId);
    if(op.action?.type==='skipUnscripted')fail('unimplemented_action');
    replay=dispatch(content,replay,{...op.action,opId:`${ticket.runId}:${i+1}`}).state;
   }
   if(replay.phase!=='finished'||!replay.result)fail('unfinished_run');
   if(canonical(replay)!==canonical(plainRun(submitted)))fail('replay_mismatch');
   const row={ticket:clone(ticket),result:clone(replay.result)};
   const previous=accepted.get(ticket.runId);if(previous&&canonical(previous)!==canonical(row))fail('submission_conflict');
   accepted.set(ticket.runId,row);return clone(row);
  },
  rows(cohort){return rankCohort([...accepted.values()],cohort);},
 };
}
export function rankCohort(rows,cohort){
 const best=new Map();
 for(const r of rows){if(r.ticket.cohort!==cohort)continue;const id=r.ticket.participantId,old=best.get(id);if(!old||compareResults(r.result,old.result)>0||(compareResults(r.result,old.result)===0&&String(r.ticket.runId||'')<String(old.ticket.runId||'')))best.set(id,r);}
 const ordered=[...best.values()].sort((a,b)=>compareResults(b.result,a.result)||(a.ticket.participantId<b.ticket.participantId?-1:a.ticket.participantId>b.ticket.participantId?1:0));
 return ordered.slice(0,30).map((r,i)=>({...clone(r),rank:1+ordered.findIndex(x=>compareResults(x.result,r.result)===0)}));
}
export function submissionTransition(run,status){
 if(!['unsent','sending','complete','failed'].includes(status))fail('bad_submission_status');
 const next=clone(run),current=next.ranking?.submission;if(!current)fail('not_daily');
 const allowed={unsent:['sending'],sending:['complete','failed'],failed:['sending'],complete:[]};
 if(status!==current.status&&!allowed[current.status].includes(status))fail('bad_submission_transition');
 if(status==='sending'&&current.status!=='sending')current.attempts++;
 current.status=status;return next;
}
