// Atomic cost modifiers for an explicit board-trap option; no shop/trade reuse.
import {clone,fail} from './util.js';
import {changeHp} from './core.js';
import {normCost} from './options.js';
import {evalExpr} from './expr.js';
import {register,envOf} from './runner.js';
export function prepareTrapItem(ctx,opt){
 if(ctx.s.phase!=='event'||ctx.s.event?.kind!=='罠'||!opt)fail('trap_item_not_allowed');
 ctx.pendingTrap={option:clone(opt),goldBefore:ctx.s.gold,hpHeal:0,requirePaid:false};
 return ctx.pendingTrap;
}
export function finishTrapItem(ctx){
 const p=ctx.pendingTrap;if(!p)return;
 if(p.requirePaid && p.goldBefore-ctx.s.gold<1)fail('trap_payment_required');
 if(p.hpHeal>0)changeHp(ctx,p.hpHeal,undefined,{reason:'trapItem'});
 delete ctx.pendingTrap;
}
register('trapItem',(ctx,op,scope)=>{
 const p=ctx.pendingTrap;
 if(!p||ctx.s.event?.kind!=='罠')fail('trap_item_not_allowed');
 const c=normCost(p.option.cost),gold=c.gold===undefined?0:evalExpr(envOf(ctx,scope),c.gold);
 if(op.mode==='paidHeal'){
   if(gold<1||ctx.s.gold<gold)fail('trap_payment_required');
   p.hpHeal=9;p.requirePaid=true;
 }else if(op.mode==='discountGold'){
   if(gold<1)fail('trap_payment_required');
   c.gold=Math.max(0,gold-110);if(ctx.s.gold<c.gold)fail('insufficient_gold');
   p.option.cost=c;
 }else if(op.mode==='replaceItem'){
   if(!Array.isArray(c.items)||!c.items.length)fail('trap_item_cost_required');
   const id=op.id===undefined?c.items[0]:evalExpr(envOf(ctx,scope),op.id);
   const at=c.items.indexOf(id);if(at<0)fail('trap_item_cost_required');
   c.items.splice(at,1);p.option.cost=c;p.hpHeal=5;
 }else fail('bad_trap_item_mode');
});
