// Battle-local typed negative states. IDs and expiry are plain JSON; legacy saves need no migration.
import {fail,clone} from './util.js';
import {changeHp,changeMp} from './core.js';
import {register,envOf} from './runner.js';
import {evalExpr} from './expr.js';
const KINDS=new Set(['attackDown','defenseDown','turnEndHpLoss']);
function battle(ctx){if(!ctx.s.battle)fail('status_outside_battle');return ctx.s.battle;}
function kinds(status){return status.kinds || [status.kind];}
function list(s){return s.battle?.temporaryStatuses || [];}
export function temporaryStatusView(s){return clone(list(s));}
export function statusPenalty(s,stat){const kind=stat==='attack'?'attackDown':stat==='defense'?'defenseDown':null;return list(s).filter(x=>kinds(x).includes(kind)).reduce((n,x)=>n+x.amount,0);}
export function enemyStatus(ctx,spec){
 const b=battle(ctx),ks=spec.kinds || [spec.kind];
 if(!Array.isArray(ks)||!ks.length||new Set(ks).size!==ks.length||ks.some(k=>!KINDS.has(k))||!Number.isInteger(spec.amount)||spec.amount<=0||!Number.isInteger(spec.turns)||spec.turns<=0)fail('bad_temporary_status');
 const allowed=ks.filter(k=>!b.statusProtection?.includes(k));
 if(!allowed.length){ctx.emit({t:'statusPrevented',kinds:ks});return null;}
 const status={id:`status-${b.nextStatusId || 1}`,kinds:allowed,amount:spec.amount,remainingTurns:spec.turns,createdRound:b.round,label:spec.label || allowed.join('/')};
 b.nextStatusId=(b.nextStatusId || 1)+1;(b.temporaryStatuses ||= []).push(status);ctx.emit({t:'temporaryStatusAdded',status:clone(status)});return status;
}
export function preventEnemyStatus(ctx,ks){const b=battle(ctx);if(!Array.isArray(ks)||ks.some(k=>!['mpLoss','attackDown','defenseDown'].includes(k)))fail('bad_status_protection');b.statusProtection=[...new Set([...(b.statusProtection||[]),...ks])];}
export function recoverEnemyMp(ctx,amount=7,enemyActions=2){const b=battle(ctx);if(!Number.isInteger(amount)||amount<1||!Number.isInteger(enemyActions)||enemyActions<1)fail('bad_mp_recovery');b.mpRecovery={amount,remainingEnemyActions:enemyActions};}
export function enemyMpLoss(ctx,amount){
 const b=battle(ctx);if(!Number.isFinite(amount)||amount<0)fail('bad_enemy_mp_loss');
 if(b.statusProtection?.includes('mpLoss')){ctx.emit({t:'enemyMpLossPrevented',amount});return 0;}
 const actual=Math.max(0,-changeMp(ctx,-amount,0,{reason:'enemy'}));ctx.emit({t:'enemyMpLost',amount:actual});
 if(actual>0&&b.mpRecovery&&ctx.s.hp>0){const recovery=b.mpRecovery;delete b.mpRecovery;changeMp(ctx,Math.min(actual,recovery.amount),0,{reason:'enemyMpRecovery'});}
 return actual;
}
export function afterEnemyStatusAction(ctx){const b=battle(ctx);delete b.statusProtection;if(b.mpRecovery&&--b.mpRecovery.remainingEnemyActions<=0)delete b.mpRecovery;}
function selected(s,kind,id){
 if(!KINDS.has(kind))fail('bad_status_kind');const candidates=list(s).filter(x=>kinds(x).includes(kind));
 if(id!==undefined&&id!==null&&id!==''){const chosen=candidates.find(x=>x.id===id);if(!chosen)fail('bad_status_selection');return chosen;}
 if(candidates.length>1)fail('status_selection_required');return candidates[0] || null;
}
function remove(ctx,ids){const b=battle(ctx),unique=new Set(ids);const removed=list(ctx.s).filter(x=>unique.has(x.id));b.temporaryStatuses=list(ctx.s).filter(x=>!unique.has(x.id));for(const status of removed)ctx.emit({t:'temporaryStatusRemoved',id:status.id,kinds:kinds(status)});return removed.length;}
export function clearTemporaryStatus(ctx,kind,id){const choice=selected(ctx.s,kind,id);return choice?remove(ctx,[choice.id]):0;}
export function clearTemporaryPair(ctx,attackId,defenseId){const a=selected(ctx.s,'attackDown',attackId),d=selected(ctx.s,'defenseDown',defenseId);const count=remove(ctx,[a?.id,d?.id].filter(Boolean));if(count)changeHp(ctx,count*6,0,{reason:'clearTemporaryPair'});return count;}
export function endTurnStatuses(ctx){
 const b=battle(ctx);if(b.lastStatusTickRound===b.round)return;b.lastStatusTickRound=b.round;
 const expired=[];
 for(const status of list(ctx.s)){
  const dot=kinds(status).includes('turnEndHpLoss');
  if(dot&&ctx.s.hp>0)changeHp(ctx,-status.amount,0,{reason:status.id});
  if(dot||status.createdRound<b.round)status.remainingTurns--;
  if(status.remainingTurns<=0)expired.push(status.id);
 }
 remove(ctx,expired);
}
register('preventEnemyStatus',(ctx,op)=>preventEnemyStatus(ctx,op.kinds));
register('recoverEnemyMp',(ctx,op)=>recoverEnemyMp(ctx,op.amount,op.enemyActions));
register('clearTemporaryStatus',(ctx,op,scope)=>clearTemporaryStatus(ctx,op.kind,scope.vars?.statusId));
register('clearTemporaryPair',(ctx,op,scope)=>clearTemporaryPair(ctx,scope.vars?.attackId,scope.vars?.defenseId));
register('applyTemporaryStatus',(ctx,op)=>enemyStatus(ctx,op));
register('enemyMpLoss',(ctx,op,scope)=>enemyMpLoss(ctx,evalExpr(envOf(ctx,scope),op.amount)));
