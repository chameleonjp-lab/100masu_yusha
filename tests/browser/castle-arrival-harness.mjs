import {appendCastleArrivalUi} from '../../src/ui/castle-arrival-ui.js';
// Real session commit/readback and real bridge/player, with DOM/clock/audio boundaries only.
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {getContent,exampleRun,place,rollDie} from '../fixtures/helpers.mjs';
import {createSession} from '../../src/ui/session.js';import {createMemoryStore} from '../../src/save/index.js';import {createMeta} from '../../src/engine/index.js';
import {planPresentation,createPresentationPlayer} from '../../src/ui/presentation-timeline.js';import {effectText} from '../../src/ui/presentation.js';
import {displayText,loadMessages} from '../../src/ui/i18n.js';
const content=await getContent(),source=readFileSync(new URL('../../src/ui/app.js',import.meta.url),'utf8');
async function fixture(){const run=rollDie(content,place(exampleRun(content,'M'),98),6).state,store=createMemoryStore();await store.startNew({run,meta:createMeta()});const session=createSession(content,store);await session.load();const before=structuredClone(session.view),effects=await session.act({type:'move'}),after=structuredClone(session.view);return {session,store,before,after,effects};}
function setup(f,settings={}){
 let now=0,id=0;const timers=new Map(),calls=[],controls=[{disabled:false},{disabled:true}];
 const node=()=>({dataset:{},style:{},children:[],textContent:'',append(...a){this.children.push(...a)},setAttribute(){},removeAttribute(){},addEventListener(){},remove(){this.removed=true},animate(frames,options){calls.push(['animate',this,frames,options]);return {cancel(){}}}});
 const hero=node(),enemy=node(),root=node(),ribbon=node(),prep=node(),actions=node(),tabs=node(),map=node();root.querySelectorAll=()=>controls;root.querySelector=s=>s==='.hero'?hero:s==='.enemy'?enemy:s==='.castle-ribbon'?ribbon:s==='.castle-preparation'?prep:s==='.actions'?actions:s==='.tabs'?tabs:s==='.map-strip'?map:null;
 const session={run:f.after,meta:{settings},view:f.after};
 const c=vm.createContext({appendCastleArrivalUi,planPresentation,createPresentationPlayer,structuredClone,Set,document:{hidden:false},session,screen:'game',reduced:{matches:false},root,stage:{update(){},arrivalVisual:p=>calls.push(['arrivalVisual',p])},lastAction:'',notice:'confirmed result',content,
 render:v=>{calls.push(['render',v]);controls[0].disabled=false;controls[1].disabled=true;},sound:{castle:p=>calls.push(["castle",p]),play:cue=>calls.push(['sound',cue]),scene(){}},el:(tag,cls,text)=>Object.assign(node(),{className:cls,textContent:text||''}),actionLabel:()=>'',
 effectText,localizedContent:x=>x,displayText,locale:()=> settings.language||'ja',pendingCommittedSound:null,setArt:(actor,key)=>{actor.pose=key;calls.push(['pose',actor,key])},getComputedStyle:()=>({transform:'matrix(1,0,0,1,-40,-70)'}),
 scheduleCommittedSound:(...args)=>calls.push(['effects',...args]),setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id},clearTimeout:id=>timers.delete(id)});
 const block=source.match(/\/\/ BEGIN committed presentation bridge\n([\s\S]*?)\/\/ END committed presentation bridge/)[1];vm.runInContext(block+'\nglobalThis.api={playCommittedPresentation,cancelPresentation,presentation};',c);
 const tick=t=>{for(;;){const entry=[...timers].filter(([,v])=>v.at<=t).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!entry)break;timers.delete(entry[0]);now=entry[1].at;entry[1].fn()}now=t};
 return {c,root,hero,enemy,ribbon,prep,actions,tabs,map,calls,controls,tick,api:c.api};
}


export {fixture,setup};
