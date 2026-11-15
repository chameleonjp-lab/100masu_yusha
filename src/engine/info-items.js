// Read-only, deterministic board information. Selection never rerolls board content.
import {bandOfPos,moveTarget} from './board.js';
import {clone,fail} from './util.js';
import {makeCtx} from './core.js';
import {optionStatus,applyCost} from './options.js';
import {newScope,runEffects,register} from './runner.js';
function collectOps(script) {
 const out=[];const walk=v=>{if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(walk);return;}if(v.op)out.push(v);for(const [k,x] of Object.entries(v))if(k!=='cost')walk(x);};walk(script);return out;
}
function previewOption(content,original,start,opt,scope,trap,tail=[]) {
 const values=opt.input?.type==='int'?Array.from({length:opt.input.max-opt.input.min+1},(_,i)=>opt.input.min+i):[undefined];
 const variants=values.map(input=>{
  const copy=clone(start),ctx=makeCtx(content,copy),local=clone(scope);
  if(opt.input)local.vars[opt.input.var]=input;
  const status=optionStatus(ctx,local,opt,input,true);
  if(!status.enabled)return {input,enabled:false,reason:status.reason};
  applyCost(ctx,status.cost,trap);const result=runEffects(ctx,[...(opt.effects||[]),...tail],local);
  const delta={...(input!==undefined?{input}:{}),enabled:true,hp:copy.hp-original.hp,mp:copy.mp-original.mp,gold:copy.gold-original.gold};
  if(result==='paused'&&copy.prompt?.kind==='choice') {
   const prompt=copy.prompt,cont=prompt.cont;
   delta.choices=prompt.options.map(child=>({id:child.id,label:child.label,...previewOption(content,original,copy,child,newScope(cont.origin,{vars:cont.vars}),trap,cont.rest)}));
  } else if(result!=='done')delta.pending=true;
  return delta;
 });
 return opt.input?{enabled:true,variants}:variants[0];
}
export function previewBoardItem(content,s,op,helpers={}) {
 const enemyFor=helpers.enemyFor || (id=>collectOps(content.scripts.events[id]).find(x=>x.op==='battle')?.enemy || (content.events[id]?.refs||[]).find(x=>/^(EN|MB)/.test(x)));
 const square=p=>{const e=content.events[s.board.squares[p-1]?.contentId];return e?{pos:p,eventId:e.id,name:e.name,kind:e.kind}:null;};
 const ahead=(n,pred)=>Array.from({length:Math.max(0,Math.min(n,99-s.pos))},(_,i)=>square(s.pos+i+1)).filter(x=>x&&pred(x));
 const select=(list)=>{const selected=list.find(x=>x.pos===op.pos);if(!selected)fail('noTarget');return selected;};
 if(op.id==='BD47') {
  if(!['装備','道具','回復'].includes(op.kind))fail('inputInvalid');
  const band=bandOfPos(content,s.pos),squares=ahead(band.range[1]-s.pos,x=>x.kind===op.kind);
  if(!squares.length)fail('noTarget');return {squares,band:band.id,remainingMoves:4};
 }
 if(op.id==='BD24') {
  const first=ahead(99,x=>content.enemies[enemyFor(x.eventId)]?.kind==='optional')[0];
  if(!first)fail('noTarget');const enemyId=enemyFor(first.eventId),en=content.enemies[enemyId];
  return {square:first,enemyId,enemyName:en.name,reward:{gold:en.rewards.goldOnWin,xp:en.rewards.xpOnWin}};
 }
 if(op.id==='BD03'||op.id==='BD10') {
  const reachable=new Set([1,2,3,4,5,6].map(d=>moveTarget(s,d)));
  const target=select(ahead(6,x=>x.kind==='戦闘'&&reachable.has(x.pos)&&(op.id!=='BD10'||content.enemies[enemyFor(x.eventId)]?.kind==='normal')));
  const enemyId=enemyFor(target.eventId),en=content.enemies[enemyId];if(!en)fail('noTarget');
  return {square:target,enemyId,enemyName:en.name,firstAction:clone({...en.phases[0].actions[0],...(collectOps(content.scripts.events[target.eventId]).find(x=>x.op==='battle')?.scenario?.roundActions||[]).find(x=>x.round===1)?.action})};
 }
 if(op.id==='BD15') {
  const target=select(ahead(10,x=>['装備','道具'].includes(x.kind)));const e=content.events[target.eventId];
  const ids=collectOps(content.scripts.events[target.eventId]).flatMap(x=>['giveGear','giveItem'].includes(x.op)?[x.id]:x.op==='chooseGear'?(x.candidates||[]):[]);
  const candidates=[...new Set(ids)].filter(id=>content.gear[id]||content.items[id]).slice(0,2).map(id=>({id,name:(content.gear[id]||content.items[id]).name}));
  if(!candidates.length)fail('noTarget');return {square:target,candidates};
 }
 if(op.id==='BD32')return {square:select(ahead(6,x=>x.kind==='罠'))};
 if(op.id==='BD13') {
  const target=select(ahead(6,x=>['回復','選択','罠'].includes(x.kind)));const sc=content.scripts.events[target.eventId];if(!sc)fail('unscripted');
  const options=sc.options||[{id:'automatic',label:'到着時',effects:sc.onLand||[]}];
  const previews=options.map(opt=>{
   const outcomes=[1,2,3,4,5,6].map(die=>{
    const copy=clone(s);copy.pos=target.pos;copy.phase='event';copy.turn={...copy.turn,die,rawDie:die};copy.event={eventId:target.eventId,kind:target.kind,pos:target.pos};
    const ctx=makeCtx(content,copy),scope=newScope({kind:'event',eventId:target.eventId,pos:target.pos});
    if(sc.options)runEffects(ctx,sc.onLand||[],scope);
    return {die,...previewOption(content,s,copy,opt,scope,target.kind==='罠')};
   });
   const stable=outcomes.every(x=>JSON.stringify({...x,die:0})===JSON.stringify({...outcomes[0],die:0}));
   return {id:opt.id,label:opt.label,...(stable?Object.fromEntries(Object.entries(outcomes[0]).filter(([k])=>k!=='die')):{enabled:true,outcomes,diePending:true})};
  });
  return {square:target,options:previews};
 }
 fail('unknown_board_item',op.id);
}

register('boardItem',(ctx,op,scope)=>{
 const input={...op,...(scope?.vars||{}),id:op.id};
 const data=previewBoardItem(ctx.content,ctx.s,input);
 if(op.id==='BD10') {
  runEffects(ctx,[{op:'reserve',slot:'arrival',pos:data.square.pos,withinMoves:1,effects:[{op:'reserve',slot:'nextBattle',filter:'normal',rules:[{id:'BD10',hook:'heroAttackDamage',when:{and:[{eq:[{ref:'battle.attackKind'},'attack']},{eq:[{ref:'battle.count',what:'attacks'},1]}]},effects:[{op:'addDamage',amount:6}],limit:{perBattle:1}}]}]}],scope);
  ctx.s.reservations.at(-1).expireAfterMove=1;
 } else if(op.id==='BD32') {
  ctx.s.reservations.push({rid:ctx.s.nextRid++,slot:'targetTrapHalf',pos:data.square.pos,withinMoves:3,movesUsed:0});
 } else {
  const rec={kind:op.id,turn:ctx.s.rolls,data,
   ...(op.id==='BD15'?{untilPassed:data.square.pos}:{}),
   ...(op.id==='BD47'?{remainingMoves:4,untilBand:data.band}:{})};
  ctx.s.reveals.push(rec);ctx.emit({t:'reveal',...rec});
 }
});
export function tickInfoMarks(content,s,to) {
 s.reveals=s.reveals.filter(r=>(r.untilPassed===undefined||to<=r.untilPassed)&&(r.untilBand===undefined||bandOfPos(content,to).id===r.untilBand));
 s.reservations=s.reservations.filter(r=>!(r.expireAfterMove&&r.movesUsed>=r.expireAfterMove)&&!(r.slot==='targetTrapHalf'&&to>r.pos));
}
