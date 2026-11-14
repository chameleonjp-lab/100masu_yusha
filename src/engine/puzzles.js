// Typed, authored puzzle metadata. No natural-language answer inference and no
// resource/reward mutation: the caller commits an outcome only after resolution.
import { clone, deepEqual, fail } from './util.js';
const KINDS=new Set(['choice','sequence','matching','numeric','compare']);
export function validatePuzzle(def) {
 const errors=[];
 if(!def || typeof def.id!=='string' || !def.id || !KINDS.has(def.kind)) return ['puzzle id/kind required'];
 const unique=a=>Array.isArray(a)&&a.length>0&&a.every(x=>typeof x==='string'&&x)&&new Set(a).size===a.length;
 if(def.kind==='numeric') {
  if(!Number.isFinite(def.answer)||!Number.isFinite(def.min)||!Number.isFinite(def.max)||def.min>def.answer||def.answer>def.max)errors.push('numeric answer outside finite bounds');
 } else {
  if(!unique(def.candidates))errors.push('distinct candidate ids required');
  else if(['choice','compare'].includes(def.kind)&&!def.candidates.includes(def.answer))errors.push('answer must be a candidate');
  else if(def.kind==='sequence'&&(!Array.isArray(def.answer)||def.answer.length!==def.candidates.length||new Set(def.answer).size!==def.answer.length||def.answer.some(x=>!def.candidates.includes(x))))errors.push('sequence answer must be a candidate permutation');
  else if(def.kind==='matching'&&(!unique(def.targets)||def.targets.length!==def.candidates.length||!def.answer||def.candidates.some(k=>!def.targets.includes(def.answer[k]))||new Set(Object.values(def.answer)).size!==def.candidates.length||Object.keys(def.answer).length!==def.candidates.length))errors.push('matching answer must be one-to-one');
 }
 if(def.cluePair!=null&&(!def.cluePair.scene||!def.cluePair.option||typeof def.cluePair.scene!=='string'||typeof def.cluePair.option!=='string'))errors.push('cluePair requires authored scene/option text');
 if(def.differences!=null&&(!Array.isArray(def.differences)||def.differences.some(x=>!x||typeof x.id!=='string'||!Number.isInteger(x.row)||x.row<0||!Number.isInteger(x.column)||x.column<0)||new Set(def.differences.map(x=>x.id)).size!==def.differences.length))errors.push('differences require unique ids and nonnegative row/column');
 return errors;
}
function check(def,s){if(validatePuzzle(def).length)fail('bad_puzzle');if(!s||s.id!==def.id)fail('puzzle_state_mismatch');}
export function createPuzzleState(def){if(validatePuzzle(def).length)fail('bad_puzzle');return {id:def.id,used:{},eliminated:[],fixedPrefix:[],fixedPairs:{},hints:[],attempts:0,pendingWrong:null,resolved:false};}
export function validPuzzleAnswer(def,answer){
 if(['choice','compare'].includes(def.kind))return def.candidates.includes(answer);
 if(def.kind==='numeric')return typeof answer==='number'&&Number.isFinite(answer)&&answer>=def.min&&answer<=def.max;
 if(def.kind==='sequence')return Array.isArray(answer)&&answer.length===def.candidates.length&&new Set(answer).size===answer.length&&answer.every(x=>def.candidates.includes(x));
 if(def.kind==='matching')return answer&&typeof answer==='object'&&!Array.isArray(answer)&&Object.keys(answer).length===def.candidates.length&&def.candidates.every(x=>def.targets.includes(answer[x]))&&new Set(Object.values(answer)).size===def.candidates.length;
 return false;
}
function correct(def,answer){return def.kind==='matching'?def.candidates.every(x=>answer[x]===def.answer[x]):deepEqual(answer,def.answer);}
export function assistPuzzle(def,state,itemId,input={}) {
 check(def,state);if(state.resolved||state.used[itemId])fail('puzzle_assist_unavailable');
 const s=clone(state);let hint;
 if(itemId!=='BD39'&&s.pendingWrong!==null)fail('puzzle_answer_pending');
 switch(itemId){
  case 'BD05': {
   if(!['choice','compare'].includes(def.kind)||def.candidates.length<3)fail('puzzle_assist_unavailable');
   const candidate=def.candidates.find(x=>x!==def.answer&&!s.eliminated.includes(x));if(candidate===undefined)fail('puzzle_assist_unavailable');s.eliminated.push(candidate);hint={kind:'eliminate',candidate};break;
  }
  case 'BD14':
   if(def.kind!=='sequence'||def.answer.length<2)fail('puzzle_assist_unavailable');s.fixedPrefix=[def.answer[0]];hint={kind:'prefix',values:[def.answer[0]]};break;
  case 'BD18':
   if(!validPuzzleAnswer(def,input.answer))fail('puzzle_input_invalid');hint={kind:'correctness',correct:correct(def,input.answer)};break;
  case 'BD23': {
   if(def.kind!=='matching')fail('puzzle_assist_unavailable');const left=def.candidates.filter(x=>!Object.hasOwn(s.fixedPairs,x));if(left.length<2)fail('puzzle_assist_unavailable');const source=left[0],target=def.answer[source];s.fixedPairs[source]=target;hint={kind:'pair',source,target};break;
  }
  case 'BD26': {
   const a=input.values;if(def.kind!=='numeric'||!Array.isArray(a)||a.length!==2||a[0]===a[1]||a.some(x=>!validPuzzleAnswer(def,x)))fail('puzzle_input_invalid');const x=Math.abs(a[0]-def.answer),y=Math.abs(a[1]-def.answer);hint={kind:'closer',index:x===y?null:x<y?0:1};break;
  }
  case 'BD33':if(!def.cluePair)fail('puzzle_assist_unavailable');hint={kind:'underline',scene:def.cluePair.scene,option:def.cluePair.option};break;
  case 'BD34': {
   if(def.kind!=='sequence'||!validPuzzleAnswer(def,input.answer))fail('puzzle_input_invalid');const index=input.answer.findIndex((x,i)=>x!==def.answer[i]);hint={kind:'firstMismatch',index:index<0?null:index};break;
  }
  case 'BD39':
   if(s.pendingWrong===null||s.attempts!==1)fail('puzzle_assist_unavailable');s.pendingWrong=null;hint={kind:'retry'};break;
  case 'BD44': {
   if(def.kind!=='compare'||!def.differences?.length)fail('puzzle_assist_unavailable');const first=[...def.differences].sort((a,b)=>a.row-b.row||a.column-b.column)[0];hint={kind:'difference',id:first.id};break;
  }
  default:fail('unknown_puzzle_assist',itemId);
 }
 s.used[itemId]=true;s.hints.push(clone(hint));return {state:s,hint};
}
export function resolvePuzzleAnswer(def,state,answer,{offerRetry=false}={}){
 check(def,state);if(state.resolved||state.pendingWrong!==null)fail('puzzle_already_answered');if(!validPuzzleAnswer(def,answer))fail('puzzle_input_invalid');
 if(state.eliminated.includes(answer)||state.fixedPrefix.some((x,i)=>answer[i]!==x)||Object.entries(state.fixedPairs).some(([k,v])=>answer[k]!==v))fail('puzzle_fixed_answer');
 const s=clone(state);const right=correct(def,answer);s.attempts++;
 if(!right&&offerRetry&&s.attempts===1&&!s.used.BD39){s.pendingWrong=clone(answer);return {state:s,outcome:'wrongPending'};}
 s.resolved=true;return {state:s,outcome:right?'correct':'wrong'};
}
export function commitPendingWrong(def,state){check(def,state);if(state.resolved||state.pendingWrong===null)fail('puzzle_no_pending_answer');const s=clone(state);s.resolved=true;return {state:s,outcome:'wrong',answer:clone(s.pendingWrong)};}
// Only public assist state may enter view(): authored correct answers stay private.
export function puzzlePublicState(state){return {id:state.id,eliminated:clone(state.eliminated),fixedPrefix:clone(state.fixedPrefix),fixedPairs:clone(state.fixedPairs),hints:clone(state.hints),pendingWrong:state.pendingWrong!==null,resolved:state.resolved};}
export function puzzleAnswerInput(def,id='answer') {
 if(['choice','compare'].includes(def.kind))return {id,type:'enum',values:[...def.candidates]};
 if(def.kind==='numeric')return {id,type:'int',min:def.min,max:def.max};
 if(def.kind==='sequence')return {id,type:'sequence',of:[...def.candidates]};
 return {id,type:'matching',of:[...def.candidates],targets:[...def.targets]};
}
export function puzzleAssistInputs(def,itemId){
 if(itemId==='BD18'||itemId==='BD34')return [puzzleAnswerInput(def)];
 if(itemId==='BD26')return [{id:'values',type:'ints',minCount:2,maxCount:2,min:def.min,max:def.max}];
 return [];
}
export function puzzleAssistProbe(def,itemId){
 if(itemId==='BD26')return {values:[def.min,def.max]};
 if(itemId==='BD18'||itemId==='BD34')return {answer:def.kind==='numeric'?def.min:def.kind==='sequence'?[...def.candidates]:def.kind==='matching'?Object.fromEntries(def.candidates.map((x,i)=>[x,def.targets[i]])):def.candidates[0]};
 return {};
}
