import {spriteMetrics} from '../../assets/characters/metrics.js';
import {createKingCrownRenderer} from '../../src/ui/king-crown-renderer.js';
import {createKingVictoryRenderer} from '../../src/ui/king-victory-renderer.js';
// Real session commit/readback and real bridge/player, with DOM/clock/audio boundaries only.
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {getContent,exampleRun,place,walk} from '../../tests/fixtures/helpers.mjs';
import {createSession} from '../../src/ui/session.js';import {createMemoryStore} from '../../src/save/index.js';import {createMeta,dispatch} from '../../src/engine/index.js';
import {planPresentation,createPresentationPlayer} from '../../src/ui/presentation-timeline.js';import {effectText,telegraphText} from '../../src/ui/presentation.js';
import {msg,displayText,loadMessages,localizedView,translate} from '../../src/ui/i18n.js';
const content=await getContent(),source=readFileSync(new URL('../../src/ui/app.js',import.meta.url),'utf8');
async function fixture(seed=1,full=false,hp=1){const store=createMemoryStore(),gate=walk(content,place(exampleRun(content,'M',seed),99,{level:20,xp:912,hp:78,mp:48,spells:{learned:['SP01'],prepared:['SP01']}}),1).state,run=dispatch(content,gate,{type:'challengeKing'}).state;run.battle.enemy.hp=hp;if(full)run.bag=Array(12).fill('HE01');await store.startNew({run,meta:createMeta()});const session=createSession(content,store);await session.load();const before=structuredClone(session.view),effects=await session.act({type:'spell',spellId:'SP01'}),after=structuredClone(session.view);return {session,store,before,after,effects};}
function setup(f,settings={},api=true,audio){


 let now=0,id=0;const timers=new Map(),calls=[],controls=[{disabled:false},{disabled:true}];
 const node=()=>({dataset:{},style:{setProperty(k,v){this[k]=v}},children:[],textContent:'',append(...a){this.children.push(...a)},setAttribute(k,v){(this.attributes??={})[k]=String(v);if(k==='class')this.className=v},removeAttribute(){},addEventListener(){},remove(){this.removed=true},animate(frames,options){calls.push(['animate',this,frames,options]);return {cancel(){calls.push(['animationCancel'])}}}});
 const hp=node(),hpMeter=node(),mp=node(),mpMeter=node(),hero=node(),enemy=node(),root=node(),enemyHp=node(),tell=node(),tellHint=node();const companions=(f.before.hero.companions||[]).map(c=>Object.assign(node(),{dataset:{companionId:c.id,companionRole:c.role}}));root.querySelectorAll=q=>q==='.companion'?companions:controls;root.querySelector=s=>s==='.stat.mp strong'?mp:s==='.stat.mp meter'?mpMeter:s==='.hero'?hero:s==='.enemy'?enemy:s==='.telegraph h2'?enemyHp:s==='.telegraph p:not(.muted)'?tell:s==='.telegraph p.muted'?tellHint:s==='.stat.hp strong'?hp:s==='.stat.hp meter'?hp:s==='.hero-stats'?hero:s==='.status'?hero:s==='.hud-stats'?hero:null;
 tell.textContent=telegraphText(f.before.battle.telegraph);tellHint.textContent=f.before.battle.telegraph.tell;hp.textContent=`${f.before.hero.hp} / ${f.before.hero.maxHp}`;hpMeter.value=f.before.hero.hp;enemy.parentElement=root;for(const actor of companions)actor.parentElement=root;
 const session={run:f.after,meta:{settings},view:f.after};
 const planner=planPresentation;
 const c=vm.createContext({msg,spriteMetrics,createKingCrownRenderer:opts=>createKingCrownRenderer({...opts,getComputedStyle:()=>({width:'132px',transform:'none'})}),translate,createKingVictoryRenderer:opts=>createKingVictoryRenderer({...opts,getComputedStyle:()=>({width:'132px',transform:'none'})}),planPresentation:planner,createPresentationPlayer,localizedView,structuredClone,Set,document:{hidden:false,createElement:()=>node(),createElementNS:()=>node()},session,screen:'game',reduced:{matches:false},root,stage:{update(){}},lastAction:'',notice:'confirmed result',content,
 render:v=>{c.api?.cancelPresentation();calls.push(['render',v]);const view=v||f.after;if(view.battle?.kind==='normal'&&typeof c.normalTellParagraph==='function')calls.push(['finalTell',c.normalTellParagraph(view.battle)])},sound:audio.api,el:(tag,cls,text)=>Object.assign(node(),{className:cls,textContent:text||''}),actionLabel:()=>'',
 effectText,telegraphText,localizedContent:x=>x,displayText,locale:()=> settings.language||'ja',pendingCommittedSound:null,setArt:(actor,key)=>{actor.pose=key;calls.push(['pose',actor,key])},getComputedStyle:()=>({width:'132px',transform:'matrix(1,0,0,1,-40,-70)'}),
 scheduleCommittedSound:(...args)=>calls.push(['effects',...args]),setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id},clearTimeout:id=>timers.delete(id)});
 const block=source.match(/\/\/ BEGIN committed presentation bridge\n([\s\S]*?)\/\/ END committed presentation bridge/)[1];vm.runInContext(source.match(/function setArt\(img,key\)\{[^\n]+/)[0]+'\nconst observedSetArt=setArt;setArt=(actor,key)=>{observedSetArt(actor,key);actor.pose=key;};\n'+block+'\nglobalThis.api={playCommittedPresentation,cancelPresentation,presentation};',c);
 const tick=t=>{for(;;){const entry=[...timers].filter(([,v])=>v.at<=t).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!entry)break;timers.delete(entry[0]);now=entry[1].at;entry[1].fn()}now=t};
 return {c,root,hp,hpMeter,mp,mpMeter,hero,enemy,enemyHp,tell,tellHint,calls,controls,tick,api:c.api};
}



import {SFX} from '../../src/ui/audio-recipes.js';
const audioSource=readFileSync(new URL('../../src/ui/audio.js',import.meta.url),'utf8');
function audioFixture(){
 const sources=[],gains=[],timers=new Map(),listeners=new Map(),contexts=[];let tid=0;
 const param=()=>({value:0,events:[],setValueAtTime(v,t){this.value=v;this.events.push([v,t])},setTargetAtTime(v,t,c){this.value=v;this.events.push([v,t,c])},linearRampToValueAtTime(v,t){this.events.push([v,t,'linear'])},cancelScheduledValues(t){this.events.push([null,t,'cancel'])},exponentialRampToValueAtTime(){}});
 const node=()=>({connect(){},disconnect(){}});
 class Context{
  constructor(){this.currentTime=0;this.state='suspended';this.sampleRate=8;this.destination=node();this.resumeCalls=0;this.suspendCalls=0;contexts.push(this)}
  async resume(){this.resumeCalls++;this.state='running'}
  async suspend(){this.suspendCalls++;this.state='suspended'}
  createGain(){const n={...node(),gain:param()};gains.push(n);return n}
  createDynamicsCompressor(){return {...node(),threshold:param(),ratio:param(),attack:param(),release:param()}}
  createBuffer(){return {getChannelData(){return new Float32Array(8)}}}
  createBiquadFilter(){return {...node(),frequency:param(),Q:param()}}
  createStereoPanner(){return {...node(),pan:param()}}
  newSource(){const n={...node(),frequency:param(),detune:param(),starts:[],stops:[],start(t){this.starts.push(t)},stop(t){this.stops.push(t)}};sources.push(n);return n}
  createOscillator(){return this.newSource()}
  createBufferSource(){return this.newSource()}
 }
 const document={hidden:false,addEventListener(name,fn){listeners.set(name,fn)}};
 const sandbox={SFX,document,navigator:{},AudioContext:Context,setTimeout(fn,ms){const id=++tid;timers.set(id,{fn,ms});return id},clearTimeout(id){timers.delete(id)}};
 vm.createContext(sandbox);
 vm.runInContext(audioSource.replace(/^import .*;\n/,'').replaceAll('export function ','function ')+'\nglobalThis.api=createAudio();',sandbox);
 return {api:sandbox.api,sources,gains,timers,contexts,document,visibility(hidden){document.hidden=hidden;listeners.get('visibilitychange')();},pendingSE(){return sources.filter(s=>s.starts.length&&!s.stops.includes(undefined))}};
}// Formal spell audio and metrics; fake WebAudio/DOM only.


export {setup,audioFixture};
