import {validateSavedResultReceipt} from './saved-result-receipt.js';
import {completedKingRouteMap} from './result-route-light.js';
import {appendCastleArrivalUi} from './castle-arrival-ui.js';
import {createKingVictoryRenderer} from './king-victory-renderer.js';
import {createKingCrownRenderer} from './king-crown-renderer.js';
import {planPresentation,createPresentationPlayer,addCommittedRecordCues,addOwnedCastleBell} from './presentation-timeline.js';
import {createLocalBoard,namePreview} from './ranking.js';
import {msg,setMessageLocale} from './i18n.js';
import {LOCALES,LOCALE_NAMES,resolveLocale,translate,auditCatalog,UI_KEYS,contentKeys,shareDraft,loadMessages,displayText,missingMessages,localizedView,localizedContent} from './i18n.js';
import {spriteMetrics} from '../../assets/characters/metrics.js';
import {loadContentInBrowser} from '../content/browser.js';
import {createIndexedDbStore} from '../save/index.js';
import {createAudio} from './audio.js';
import {createSession} from './session.js';
import {createStage,project} from './stage.js';
import {mountCastleBackground} from './castle-background-dom.js';
import {createCastleImageCache} from './castle-background-cache.js';
import {actionLabel,telegraphText,parseInput,effectText,companionSummary,comparisonText,mapTiles,puzzleHintText} from './presentation.js';
const CANONICAL_URL=null; // Requires owner-confirmed official URL; never infer from localhost.
const sound=createAudio();
const root=document.querySelector('#app');let content,session,stage,screen='home',tab='main',notice='',error='',lastAction='',timer=0;
const castleImages=createCastleImageCache({createImage:()=>document.createElement('img'),isHidden:()=>document.hidden});
document.addEventListener('visibilitychange',()=>castleImages.prefetch(session?.view,{home:screen!=='game',committed:!!session&&!presentation.running}));
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
const add=(p,...xs)=>{xs.filter(Boolean).forEach(x=>p.append(x));return p};
function button(text,fn,cls=''){
 const b=el('button',cls,text);b.type='button';
 b.addEventListener('click',()=>{
  const tap={generation:++tapSoundGeneration,dialog:null};
  let generation; // Capture the screen after this button's own synchronous action.
  sound.unlock().then(()=>{if(tap.generation===tapSoundGeneration&&generation===committedSoundGeneration&&(!tap.dialog||tap.dialog.open)&&!document.hidden&&!session?.meta?.settings?.mute)sound.play('ui.tap')},()=>{});
  const previousTap=activeTap;activeTap=tap;
  try{fn()}finally{activeTap=previousTap;generation=committedSoundGeneration;}
 });
 return b;
}
let committedSoundGeneration=0,committedSoundPreparation=null,pendingCommittedSound=null,tapSoundGeneration=0,activeTap=null;
function invalidateCommittedSound(){committedSoundGeneration++;pendingCommittedSound=null;}
function prepareCommittedSound({preserveTap=false}={}){if(!preserveTap)tapSoundGeneration++;cancelSkipSound();if(typeof cancelRecordCues==='function')cancelRecordCues();if(pendingFleeSound)pendingFleeSound.cancelled=true;pendingCommittedSound=null;const preparation={};committedSoundPreparation=preparation;try{Promise.resolve(sound.unlock()).then(()=>{if(committedSoundPreparation!==preparation)return;committedSoundPreparation=null;const play=pendingCommittedSound;pendingCommittedSound=null;play?.();},()=>{if(committedSoundPreparation===preparation){committedSoundPreparation=null;pendingCommittedSound=null;}});}catch{if(committedSoundPreparation===preparation){committedSoundPreparation=null;pendingCommittedSound=null;}}}
let activeRecordCues=[];
function cancelRecordCues(){discardRecordCues(activeRecordCues);activeRecordCues=[];}
function discardRecordCues(cues){try{sound.discardRecordCues?.(cues)}catch{}}
function scheduleCommittedSound(fx,key,runId,revision,cue=null,committedCues=[]){
 if((!fx.length&&!cue&&!committedCues.length)||document.hidden||screen!=='game'||session?.meta?.settings?.mute){discardRecordCues(committedCues);return}
 // Existing effects may wait for gesture unlock; receipt cues never do.
 if(committedSoundPreparation){discardRecordCues(committedCues);committedCues=[];}else if(committedCues.length)activeRecordCues=committedCues;
 const generation=committedSoundGeneration;const play=()=>{if(generation!==committedSoundGeneration||document.hidden||screen!=='game'||session?.meta?.settings?.mute||session?.run?.runId!==runId||session?.run?.revision!==revision){discardRecordCues(committedCues);return}try{if(cue)sound.play(cue);else sound.effects(fx,key,{committedCues})}catch{discardRecordCues(committedCues)}};
 if(committedSoundPreparation)pendingCommittedSound=play;else play();
}
// BEGIN saved result marks
let savedRecordLedger=null,savedRecordToken=null;
function cancelSavedRecordPresentation(){const token=savedRecordToken;savedRecordToken=null;if(!token)return;token.cancelled=true;for(const id of token.timers)clearTimeout(id);for(const animation of token.animations)try{animation.cancel()}catch{}}
function captureSavedRecordSnapshot(){return {beforeRun:structuredClone(session.run),beforeMeta:structuredClone(session.meta)}}
function acceptSavedRecordReceipt(before,effects){
 const receipt=validateSavedResultReceipt({...before,afterRun:structuredClone(session.run),afterMeta:structuredClone(session.meta),status:session.status,effects});
 if(!receipt)return null;
 if(!savedRecordLedger||savedRecordLedger.runId!==receipt.runId)savedRecordLedger={runId:receipt.runId,revision:receipt.revision,keys:new Set(),presented:new Set(),discoveries:{enemies:new Set(),companions:new Set(),gear:new Set()},bestResult:null};
 const ledger=savedRecordLedger;if(receipt.revision<ledger.revision||ledger.keys.has(receipt.key))return null;
 ledger.keys.add(receipt.key);ledger.revision=receipt.revision;
 for(const kind of ['enemies','companions','gear'])for(const id of receipt.discoveries[kind])ledger.discoveries[kind].add(id);
 if(receipt.newBest)ledger.bestResult=structuredClone(receipt.result);
 return receipt;
}
function savedRecordMarks(){
 const ledger=savedRecordLedger,run=session?.run;
 if(!ledger||!run||run.runId!==ledger.runId||run.revision<ledger.revision)return null;
 const section=el('section','story saved-record-marks');section.setAttribute('role','status');section.setAttribute('aria-live','polite');
 if(ledger.bestResult&&run.result&&JSON.stringify(run.result)===JSON.stringify(ledger.bestResult)){const best=el('p','saved-best-ribbon',msg('ui.result.newBest'));best.style.background='#F4B942';best.style.padding='.5rem';section.append(best);}
 const counts=['enemies','companions','gear'].map(k=>ledger.discoveries[k].size);
 if(counts.some(Boolean)){const entry=el('p','saved-new-entries',msg('ui.result.newEntries',{p0:counts[0],p1:counts[1],p2:counts[2]}));entry.style.border='2px solid #F4B942';entry.style.padding='.5rem';section.append(entry,el('small','muted',msg('ui.result.newEntriesScope')));}
 return section.children.length?section:null;
}
function deliverSavedRecordPresentation(receipt){
 cancelSavedRecordPresentation();if(!receipt||!savedRecordLedger||savedRecordLedger.runId!==receipt.runId||!savedRecordLedger.keys.has(receipt.key)||savedRecordLedger.presented.has(receipt.key))return;savedRecordLedger.presented.add(receipt.key);if(document.hidden||screen!=='game'||session.run?.runId!==receipt.runId||session.run?.revision!==receipt.revision)return;
 // Consume at successful-act time only. A missing/unsupported visual or audio API is not retried by render.
 let marks=root.querySelector('.saved-record-marks');if(!marks){marks=savedRecordMarks();if(marks)root.append(marks)}if(!marks)return;
 const token={cancelled:false,animations:[],timers:[],runId:receipt.runId,revision:receipt.revision};savedRecordToken=token;
 const motionReduced=reduced.matches||session.meta.settings?.reducedMotion,short=session.meta.settings?.animation==='short';
 for(const [show,selector,cue,standard,brief] of [[receipt.newBest,'.saved-best-ribbon','best',400,150],[receipt.discoveryCount>0,'.saved-new-entries','new.entry',200,100]]){
  if(!show)continue;const mark=marks.querySelector(selector);if(!mark)continue;
  if(typeof mark.animate==='function')try{const frames=motionReduced?[{opacity:.4},{opacity:1}]:[{opacity:.4,transform:'scale(.9)'},{opacity:1,transform:'scale(1)'}];token.animations.push(mark.animate(frames,{duration:motionReduced?150:short?brief:standard,easing:'ease-out'}))}catch{}
 }

}
function recordCuesForReceipt(receipt){if(!receipt||!savedRecordLedger?.keys.has(receipt.key))return [];return [[receipt.newBest,'best'],[receipt.discoveryCount>0,'new.entry']].filter(([yes])=>yes).map(([,cue])=>({key:`${receipt.key}:meta:${cue}`,cue}));}
// END saved result marks
// BEGIN committed presentation bridge
// BEGIN result route map
function lightResultRoute(svg,litBands){if(!svg)return;for(const g of svg.querySelectorAll('[data-band]')){const lit=Number(g.dataset.band)<=litBands;g.dataset.lit=String(lit);g.setAttribute('fill',lit?'#F4B942':'#BDA882');g.setAttribute('stroke',lit?'#F4B942':'#BDA882');}}
function resultRouteMap(v){
 const model=completedKingRouteMap(v);if(!model)return null;
 if(typeof document.createElementNS!=='function'){const list=el('ol','world-map result-route-fallback');list.dataset.routeFallback='static';list.setAttribute('aria-label',msg('ui.app.worldMap.term.b6e1addfac'));for(const tile of mapTiles(v)){const item=el('li','visited'+(tile.inn?' inn':''),String(tile.pos));item.setAttribute('aria-label',tile.label);if(tile.inn)item.dataset.inn=String(tile.pos);if(tile.pos===100)item.dataset.castle='100';list.append(item);}return list;}
 const ns='http://www.w3.org/2000/svg',make=(tag,attrs={})=>{const n=document.createElementNS(ns,tag);for(const [k,val] of Object.entries(attrs))n.setAttribute(k,val);return n;};
 const svg=make('svg',{viewBox:'0 0 370 200',role:'img','aria-label':msg('ui.app.worldMap.term.b6e1addfac'),class:'result-route-map',width:'100%'});svg.dataset.resultRoute='';
 const xy=pos=>{const i=pos-1,row=Math.floor(i/20),col=i%20;return [22+(row%2?19-col:col)*17,28+row*36];};
 for(const segment of model.segments){const g=make('g',{'stroke-width':2});g.dataset.band=String(segment.band);const points=[];if(segment.from>1)points.push(xy(segment.from-1).join(','));for(let pos=segment.from;pos<=segment.to;pos++)points.push(xy(pos).join(','));g.append(make('polyline',{points:points.join(' '),fill:'none','stroke-width':4,'stroke-linejoin':'round'}));
  for(const tile of mapTiles(v).filter(t=>t.pos>=segment.from&&t.pos<=segment.to)){const [x,y]=xy(tile.pos),point=make('circle',{cx:x,cy:y,r:3});point.dataset.pos=String(tile.pos);const title=make('title');title.textContent=tile.label;point.append(title);g.append(point);
   if(tile.inn){const lamp=make('rect',{x:x-3,y:y-12,width:6,height:8,rx:2});lamp.dataset.inn=String(tile.pos);g.append(lamp);}
   if(tile.pos===100){const castle=make('path',{d:`M${x-7} ${y-4}v-12h4v3h6v-3h4v12z`});castle.dataset.castle='100';g.append(castle);}
   if(tile.pos===1||tile.pos===100){const label=make('text',{x,y:y+17,fill:'#2A1E16',stroke:'none','font-size':11,'text-anchor':'middle'});label.textContent=String(tile.pos);g.append(label);}
  }svg.append(g);
 }lightResultRoute(svg,5);return svg;
}
// END result route map
// BEGIN saved growth display
function levelUpRows(e,h){
 const change=(key)=>String(h[key]-e.gains[key])+' → '+h[key]+' (+'+e.gains[key]+')';
 return [effectText(e,localizedContent(content,locale()))+' '+e.from+' → '+e.to,
  msg('ui.app.render.term.d6d2aa99fd')+' '+h.hp+'/'+(h.maxHp-e.gains.maxHp)+' → '+h.hp+'/'+h.maxHp+' (+'+e.gains.maxHp+')',
  msg('ui.app.render.term.522148a1fd')+' '+h.mp+'/'+(h.maxMp-e.gains.maxMp)+' → '+h.mp+'/'+h.maxMp+' (+'+e.gains.maxMp+')',
  msg('ui.presentation.comparisonText.term.fa133cb7c1')+change('attack'),
  msg('ui.presentation.comparisonText.term.48cf4313fd')+change('defense')];
}
function appendSavedKingGrowth(root,v){
 const r=session?.meta?.uiLastResult,h=v?.hero;
 if(!r||!h||r.runId!==session.run?.runId||r.revision!==session.run?.revision||r.runId!==v?.runId||r.revision!==v?.revision||!['battleReward','bagFull'].includes(v.phase)||v.reward?.enemyId!=='DK01'||v.reward.victory!==true||!Array.isArray(r.effects))return;
 const levels=r.effects.filter(e=>e?.t==='levelUp');if(levels.length!==1)return;const e=levels[0],from=content.levelTable?.[e.from-1],to=content.levelTable?.[e.to-1],keys=['maxHp','maxMp','attack','defense'],nn=x=>Number.isSafeInteger(x)&&x>=0;
 if(!Number.isSafeInteger(e.from)||!Number.isSafeInteger(e.to)||e.from<1||e.to<=e.from||e.to!==h.level||!from||!to||keys.some(k=>!nn(e.gains?.[k])||e.gains[k]!==to[k]-from[k]||e.stats?.[k]!==to[k]||h.levelRow?.[k]!==to[k]||!nn(h[k])||h[k]<e.gains[k])||h.maxHp!==to.maxHp||h.maxMp!==to.maxMp)return;
 const panel=el('section','story saved-level-up');panel.setAttribute('role','status');for(const text of levelUpRows(e,h))panel.append(el('p','',text));root.append(panel);
}
// END saved growth display
function rewardRowTexts(r){const none=msg('ui.reward.none'),gear=r.gear.hit?(r.gear.alreadyOwned?msg('ui.reward.owned'):(r.gear.name||msg('ui.reward.won'))):none,item=r.item.hit?(r.item.name||msg('ui.reward.won'))+(r.item.state==='prompt'?msg('ui.reward.itemPending'):r.item.state==='added'?msg('ui.reward.itemAdded'):''):none;return [msg('ui.reward.gold',{amount:r.gold}),msg('ui.reward.xp',{amount:r.xp}),msg('ui.reward.gear',{outcome:gear}),msg('ui.reward.item',{outcome:item})]}
// Visual integration: board and strict nonterminal normal attack only. No dispatch or persistence.
// Battle audio retains the existing committed-effects path, not visual-stage synchronization.
let preserveRecordSound=false;
let presentationContext=null,skipSoundGeneration=0,lastKingTurnKey=null,lastGuardKey=null,lastFleeKey=null,lastResultRouteKey=null,pendingFleeSound=null;
const skipSoundTimers=new Set();let activeSkipSound=null;
function cancelSkipSound(){activeSkipSound?.cancel();activeSkipSound=null;}
function releasePresentation(context){
 if(context.resultRouteVisual)lightResultRoute(context.resultMap,5);
 for(const restore of context.supportRestorers||[])restore();context.levelUpPanel?.remove();context.rewardPanel?.remove();context.spellMp?.remove();context.spellCast?.remove();for(const node of context.spellResults||[])node.remove();context.crownRenderer?.dispose();context.crownBadge?.remove();context.victoryRenderer?.dispose();
 for(const [control,disabled] of context.controls)control.disabled=disabled;
 for(const animation of context.animations)animation.cancel();
 for(const timer of context.regionTimers||[])clearTimeout(timer);context.regionHandle?.cancel();context.regionBanner?.remove();
 context.skip?.remove();context.path?.remove();context.status?.remove();delete root.dataset.presentation;
}
function presentationCurrent(context){return context&&screen==='game'&&!document.hidden&&session?.run?.runId===context.after.runId&&session?.run?.revision===context.after.revision}
function presentationSound(cue,options){if(presentationCurrent(presentationContext)&&presentationContext.audio&&!session.meta.settings?.mute)try{sound.play(cue,0,options)}catch{/* audio cannot strand a confirmed result */}}
function savedFleeResult(v){const r=session?.meta?.uiLastResult,e=Array.isArray(r?.effects)?r.effects[r.effects.length-1]:null;if(v?.phase!=='board'||v.battle!=null||v.reward!=null||v.prompt!=null||v.event!=null||v.result!=null||v.victory!=null||!r||r.runId!==v.runId||r.revision!==v.revision||r.runId!==session.run?.runId||r.revision!==session.run?.revision||!Array.isArray(r.effects)||!r.effects.length||!e||Object.keys(e).length!==2||e.t!=='fled'||e.enemyId==='DK01'||!content.enemies||!Object.hasOwn(content.enemies,e.enemyId))return '';if(r.effects.length!==1){const fx=r.effects,u=fx[0];if(!u||Object.keys(u).length!==3||u.t!=='itemUsed'||u.id!=='HE20'||u.where!=='flee')return '';let at=1;for(const [key,max,base] of [['hp','maxHp',12],['mp','maxMp',3]]){const h=v.hero;if(!h||!Number.isSafeInteger(h[key])||!Number.isSafeInteger(h[max])||h[key]<0||h[key]>h[max])return '';if(fx[at]?.t===key){const q=fx[at++];if(Object.keys(q).length!==4||!Number.isSafeInteger(q.before)||q.before<0||!Number.isSafeInteger(q.delta)||q.delta<=0||q.after!==h[key]||q.after!==Math.min(h[max],q.before+base)||q.after-q.before!==q.delta)return '';}else if(h[key]!==h[max])return '';}if(at!==fx.length-1)return ''; }const t=translate(locale(),'ui.battle.fledNoReward');return t.sourceLocale?t.text:'';}
function normalTellParagraph(battle){const p=el('p','',telegraphText(battle.telegraph));if(battle.kind==='normal'&&battle.telegraph.kind==='大技')p.dataset.danger=session.meta.settings?.animation==='short'||session.meta.settings?.reducedMotion||reduced.matches?'still':'pulse';return p;}
function fleeSound(context){
 if(context.fleeSound||!presentationCurrent(context)||!context.audio||session.meta.settings?.mute)return;
 const token={cancelled:false,finalizing:false};context.fleeSound=token;pendingFleeSound=token;
 try{Promise.resolve(sound.unlock()).then(()=>{if(token.cancelled||pendingFleeSound!==token||!presentationCurrent(context)||session.meta.settings?.mute)return;token.cancelled=true;try{sound.play('flee')}catch{}},()=>{token.cancelled=true})}catch{token.cancelled=true}
}
function guardSound(context,step){
 if(!presentationCurrent(context)||!context.audio||session.meta.settings?.mute)return;
 try{if(step.payload.cue.startsWith('tell.')){const e=context.effects[step.payload.effectIndex];if(e?.t==='enemyTell')sound.effects([e],step.key)}else sound.play(step.payload.cue,0,step.payload.options)}catch{/* confirmed state remains final */}
}
const presentation=createPresentationPlayer({clock:{setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id)},
 onStep(step){
  const context=presentationContext;if(!presentationCurrent(context)){cancelPresentation();return}
  if(step.kind==='sound'){if(step.payload.skipOnly)return;if(step.payload.recordCue){if(context.audio&&!session.meta.settings?.mute)try{sound.recordCue({key:step.key,cue:step.payload.cue})}catch{}else discardRecordCues([{key:step.key,cue:step.payload.cue}]);return;}if(context.fleeVisual){if(step.payload.cue==='flee')fleeSound(context);return}if(context.guardVisual){guardSound(context,step);return}if(context.spellVisual&&['cast','cast.'+context.spellId.toLowerCase()].includes(step.payload.cue)){if(context.audio&&!session.meta.settings?.mute)try{sound.spell({type:'cue',key:context.castleKey,spellId:context.spellId,cue:step.payload.cue})}catch{}return}if(context.kingVictoryVisual&&step.payload.cue==='victory'){if(context.audio&&!session.meta.settings?.mute)try{sound.kingVictory({type:'cue',key:context.castleKey})}catch{}return}presentationSound(step.payload.cue,step.payload.options);return}
  if(step.kind!=='display')return;
  const p=step.payload;root.dataset.presentation=p.stage;
  if(context.resultRouteVisual&&p.stage==='result.route.light'){lightResultRoute(context.resultMap,p.litBands);return;}
  if(p.stage==='king.reward.levelUp'){
   context.levelUpPanel?.remove();const panel=el('section','presentation-level-up'),rows=levelUpRows(p.effect,context.after.hero);panel.setAttribute('role','status');panel.append(el('p','',rows[0]));context.levelUpPanel=panel;root.append(panel);
   rows.slice(1).forEach((text,i)=>{const show=()=>{if(presentationContext===context&&presentationCurrent(context)&&context.levelUpPanel===panel)panel.append(el('p','',text))};const delay=i*p.durationMs/4;if(!delay)show();else context.regionTimers.push(setTimeout(show,delay))});return;
  }
  if(p.stage.startsWith('king.reward.')){
   if(!context.rewardPanel){context.rewardPanel=el('section','presentation-rewards');root.append(context.rewardPanel)}
   const rows=rewardRowTexts(localizedView(context.after,content,locale()).reward);
   for(const i of p.stage==='king.reward.money'?[0,1]:p.stage==='king.reward.gear'?[2]:[3])context.rewardPanel.append(el('p','',rows[i]));
   return;
  }
  if(p.stage.startsWith('king.victory.')){
   if(p.stage==='king.victory.music'){if(context.audio)try{sound.kingVictory({type:'stop',key:context.castleKey})}catch{}return}
   if(!context.victoryRenderer)context.victoryRenderer=createKingVictoryRenderer({root,enemy:root.querySelector('.enemy'),document,label:context.victoryLabel});
   if(p.stage==='king.victory.disappear')context.victoryRenderer.disappear(p);
   if(p.stage==='king.victory.label')context.victoryRenderer.label();
   return;
  }
  if(p.stage.startsWith('king.crown.')){
   if(p.stage==='king.crown.pause'){
    for(const a of context.animations)a.pause?.();if(context.audio)try{sound.kingTurn({type:'pause',key:context.castleKey,view:context.before})}catch{}
   }
   if(p.stage==='king.crown.crack'||p.stage==='king.crown.banner'){
    if(!context.crownRenderer)context.crownRenderer=createKingCrownRenderer({root,enemy:root.querySelector('.enemy'),document,labels:context.crownLabels});
    if(p.stage==='king.crown.crack')context.crownRenderer.crack(p);else context.crownRenderer.banner(p);
   }
   if(p.stage==='king.crown.resume'){
    context.crownRenderer?.dispose();context.crownRenderer=null;context.kingPhase=2;
    const enemy=root.querySelector('.enemy');if(!enemy)throw Error('Missing king actor');setArt(enemy,'dk01-p2-idle');
    const heading=root.querySelector('.telegraph h2');if(!heading)throw Error('Missing king heading');const badge=el('span','king-phase-badge',displayText(locale(),context.after.battle.phase.name));badge.style.background='#E3A41C';badge.style.padding='.15rem .4rem';heading.append(badge);context.crownBadge=badge;
    for(const a of context.animations)a.play?.();if(context.audio)try{sound.kingTurn({type:'resume',key:context.castleKey,view:context.before})}catch{}
   }
   return;
  }
  if(p.stage.startsWith('king.turn.')){
   const hero=root.querySelector('.hero'),enemy=root.querySelector('.enemy');
   if(!hero||!enemy)throw Error('Missing king turn actors');
   const outfit={JB00:'traveler',JB01:'warrior',JB02:'mage',JB03:'bard'}[context.before.hero.job.id]||'traveler';
   const phase=context.kingPhase||(context.before.battle.phase.index>0?2:1);
   const animate=(actor,frames,ms)=>{if(actor.animate&&ms)context.animations.push(actor.animate(frames,{duration:reduced.matches||session.meta.settings?.reducedMotion?Math.min(ms,150):ms,easing:'ease-in-out'}))};
   if(p.stage==='king.turn.spell.mp'){
    const value=root.querySelector('.stat.mp strong'),meter=root.querySelector('.stat.mp meter');if(!value||!meter)throw Error('Missing hero MP');value.textContent=`${p.effect.after}/${context.before.hero.maxMp}`;meter.value=p.effect.after;
    context.spellMp?.remove();context.spellMp=el('p','presentation-spell-mp',`${p.effect.before} → ${p.effect.after} · ${effectText(p.effect,localizedContent(content,locale()))}`);context.spellMp.setAttribute('role','status');root.append(context.spellMp);
   }
   if(p.stage==='king.turn.spell.prepare'){setArt(hero,`hero-${outfit}-cast-prepare`);if(p.motion==='fade')animate(hero,[{opacity:.65},{opacity:1}],p.durationMs);}
   if(p.stage==='king.turn.spell.cast'){
    setArt(hero,`hero-${outfit}-cast`);context.spellCast?.remove();context.spellCast=el('p','presentation-spell-cast',effectText(p.effect,localizedContent(content,locale())));root.append(context.spellCast);
    animate(hero,[{opacity:.65},{opacity:1}],p.durationMs);
   }
   if(['king.turn.spell.hp','king.turn.spell.support','king.turn.spell.blockSource'].includes(p.stage)){
    const localized=localizedContent(content,locale());let text=effectText(p.effect,localized);
    if(p.stage==='king.turn.spell.hp'){const value=root.querySelector('.stat.hp strong'),meter=root.querySelector('.stat.hp meter');if(!value||!meter)throw Error('Missing hero HP');value.textContent=`${p.effect.after}/${context.before.hero.maxHp}`;meter.value=p.effect.after;text=`${p.effect.before} → ${p.effect.after} · ${text}`;}
    if(p.stage==='king.turn.spell.blockSource'){if(p.effect.t==='rule')text=localized.spells.SP03.name;else text=msg('ui.presentation.module.fc72b13abf',{p0:p.effect.amount});}
    const result=el('p','presentation-spell-result',text);root.append(result);context.spellResults.push(result);context.status.textContent=text;
    if(p.stage==='king.turn.spell.support'){
     const actor=[...root.querySelectorAll('.companion')].find(n=>n.dataset.companionId===p.effect.id&&n.dataset.companionRole===p.effect.role);if(!actor)throw Error('Missing support actor');
     const idle='comp-'+p.effect.role+'-idle';setArt(actor,'comp-'+p.effect.role+'-support');
     const previous=context.supportOwners.get(actor);previous?.animation?.cancel();for(const a of previous?.leafAnimations||[])a.cancel();previous?.leaves?.remove();const owner={};context.supportOwners.set(actor,owner);let active=true;const restore=()=>{if(!active)return;active=false;owner.leaves?.remove();if(context.supportOwners.get(actor)!==owner)return;context.supportOwners.delete(actor);setArt(actor,idle)};context.supportRestorers.push(restore);
     const reducedSupport=reduced.matches||session.meta.settings?.reducedMotion,ms=reducedSupport?150:p.effect.role==='medic'?(session.meta.settings?.animation==='short'?100:250):p.durationMs;
     if(actor.animate&&ms){const rawTransform=getComputedStyle(actor).transform,transform=rawTransform&&rawTransform!=='none'?rawTransform:'translate(0px,0px)';const frames=reducedSupport?[{opacity:.65},{opacity:1}]:[{transform},{transform:transform+' translateX(12px)'},{transform}];const a=actor.animate(frames,{duration:ms,easing:'ease-in-out'});owner.animation=a;a.onfinish=p.effect.role==='medic'?null:restore;context.animations.push(a);
      if(p.effect.role==='medic'){
       const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('class','actor companion presentation-medic-leaves');svg.setAttribute('viewBox','0 0 103 146');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');svg.style.left=actor.style.left;svg.style.top=actor.style.top;svg.style.pointerEvents='none';
       const m=spriteMetrics['comp-medic-support'];svg.style.setProperty('--sprite-ratio',m.width/m.baseWidth);svg.style.setProperty('--anchor-x',-m.anchorX+'%');svg.style.setProperty('--anchor-y',-m.anchorY+'%');
       const group=document.createElementNS('http://www.w3.org/2000/svg','g');group.setAttribute('transform','translate(0 -18)');svg.append(group);
       // Exact leaf geometry/colors from comp-medic-support.svg; no new asset or whole-body glow.
       for(const [cx,cy,rx,ry,angle,fill] of [[78,80,6,3.5,-40,'#8DC070'],[72,82,5,3,30,'#A9D48E']]){const leaf=document.createElementNS('http://www.w3.org/2000/svg','ellipse');for(const [key,value] of Object.entries({cx,cy,rx,ry,transform:'rotate('+angle+' '+cx+' '+cy+')',fill,stroke:'#2A1E16','stroke-width':2,'stroke-linejoin':'round','stroke-linecap':'round'}))leaf.setAttribute(key,value);group.append(leaf)}
       actor.parentElement.append(svg);owner.leaves=svg;const duration=reducedSupport?150:session.meta.settings?.animation==='short'?150:400;
       const glow=svg.animate(reducedSupport?[{opacity:0},{opacity:1},{opacity:0}]:[{opacity:0,filter:'brightness(1)'},{opacity:1,filter:'brightness(1.8)'},{opacity:0,filter:'brightness(1)'}],{duration,easing:'ease-in-out'});glow.onfinish=restore;owner.leafAnimations=[glow];context.animations.push(glow);
       if(!reducedSupport){const travel=svg.animate(frames,{duration:ms,easing:'ease-in-out'});owner.leafAnimations.push(travel);context.animations.push(travel)}
      }
     }else restore();
    }
    if(p.stage!=='king.turn.spell.support'&&(p.motion==='fade'||p.motion==='heal'))animate(hero,[{opacity:.65},{opacity:1}],p.durationMs);
   }
   if(p.stage==='king.turn.hero.prepare')setArt(hero,`hero-${outfit}-idle`);
   if(p.stage==='king.turn.hero.slash')setArt(hero,`hero-${outfit}-attack`);
   if(p.stage==='king.turn.enemy.hit'){
    setArt(enemy,`dk01-p${phase}-idle`);context.status.textContent=effectText(p.hit,localizedContent(content,locale()));
    const hp=root.querySelector('.telegraph h2');if(!hp)throw Error('Missing king HP');const phaseBadge=hp.querySelector?.('.king-phase-badge');hp.textContent=`${displayText(locale(),context.before.battle.enemy.name)} · ${p.hit.hp}/${p.hit.maxHp}`;if(phaseBadge)hp.append(phaseBadge);
    animate(enemy,p.motion==='fade'?[{opacity:.65},{opacity:1}]:[{filter:'brightness(1.6)'},{filter:'brightness(1)'}],p.durationMs);
   }
   if(p.stage==='king.turn.enemy.prepare'){
    context.status.textContent=displayText(locale(),p.enemyAct.name);const kind=p.enemyAct.kind,pose=/big|大/.test(kind)?'big':/guard|守/.test(kind)?'guard':/open|隙/.test(kind)?'open':'attack';setArt(enemy,`dk01-p${phase}-${pose}`);
   }
   if(p.stage==='king.turn.hero.block'&&p.blocked>0){setArt(hero,`hero-${outfit}-guard`);context.status.textContent=p.sources.map(f=>effectText(f,localizedContent(content,locale()))).filter(Boolean).join(' · ')}
   if(p.stage==='king.turn.hero.hit'){
    setArt(hero,`hero-${outfit}-${p.hit.amount>0?'hit':'guard'}`);context.status.textContent=effectText(p.hit,localizedContent(content,locale()));
    const value=root.querySelector('.stat.hp strong'),meter=root.querySelector('.stat.hp meter');if(!value||!meter)throw Error('Missing hero HP');value.textContent=`${p.hit.hp}/${p.hit.maxHp}`;meter.value=p.hit.hp;
   }
   if(p.stage==='king.turn.nextTell'){
    const name=root.querySelector('.telegraph p:not(.muted)'),hint=root.querySelector('.telegraph p.muted');if(!name||!hint)throw Error('Missing king telegraph');name.textContent=telegraphText({...p.telegraph,name:displayText(locale(),p.telegraph.name)});hint.textContent=displayText(locale(),p.telegraph.tell||'');
   }
   return;
  }
  if(p.stage==='king.start'){context.status.textContent=displayText(locale(),p.telegraph.name);return;}
  if(p.stage==='castle.fade'||p.stage==='castle.arrive'){if(context.audio)sound.castle({type:p.stage==='castle.fade'?'fade':'arrive',key:context.castleKey});if(p.stage==='castle.arrive'){
    render(context.after,{castleContext:context});
    context.controls=[...root.querySelectorAll('.actions input,.actions select,.actions button,.castle-preparation button')].map(control=>[control,control.disabled]);for(const [control] of context.controls)control.disabled=true;
    for(const n of [context.path,context.status,context.skip])if(n)root.append(n);context.status.textContent='100 / 100';
    for(const selector of ['.castle-ribbon','.castle-preparation','.actions','.tabs','.map-strip']){const n=root.querySelector(selector);if(n)n.hidden=true}
    stage?.update({band:context.after.board?.band?.id||5,pos:100,phase:'gate'},false);stage.arrivalVisual({type:'look',key:context.castleKey,short:session.meta.settings?.animation==='short',reducedMotion:reduced.matches||session.meta.settings?.reducedMotion});
   }return;}
  if(p.stage==='castle.light'){stage.arrivalVisual({type:'light',key:context.castleKey});return;}
  if(p.stage==='castle.ribbon'||p.stage==='castle.prepare'){
   const selectors=p.stage==='castle.ribbon'?['.castle-ribbon']:['.castle-preparation','.actions'];
   for(const selector of selectors){const n=root.querySelector(selector);if(n){n.hidden=false;if(n.animate)context.animations.push(n.animate([{opacity:0},{opacity:1}],{duration:p.durationMs,easing:'ease-out'}))}}return;
  }
  if(p.stage==='region.transition'){
   context.regionHandle?.cancel();
   context.regionHandle=stage.transitionRegion({fromBand:p.fromBand,band:p.band.id,durationMs:p.durationMs,reducedMotion:p.motion==='fade'});
   context.regionBanner?.remove();const banner=el('p','presentation-region',tr(`ui.region.bands.${p.band.id}.name`));banner.setAttribute('role','status');root.append(banner);context.regionBanner=banner;
   const timer=setTimeout(()=>{if(presentationCurrent(context)&&context.regionBanner===banner)banner.remove()},p.bannerMs);context.regionTimers.push(timer);
   if(context.audio)sound.scene({phase:'board',board:{band:p.band}});
   return;
  }
  if(context.fleeVisual&&p.stage==='battle.flee.departure'){
   for(const actor of [root.querySelector('.hero'),...root.querySelectorAll('.companion')]){const base=globalThis.getComputedStyle?.(actor).transform,anchor=base&&base!=='none'?base:'';const frames=p.motion==='fade'?[{opacity:1},{opacity:0}]:[{transform:anchor,opacity:1},{transform:`${anchor} translateX(-48px)`,opacity:0}];context.animations.push(actor.animate(frames,{duration:p.durationMs,easing:'ease-in',fill:'forwards'}));}return;
  }
  if(context.fleeVisual&&p.stage==='battle.flee.result'){context.status.textContent=context.fleeText;return;}
  if(p.stage.startsWith('battle.')){
   const hero=root.querySelector('.hero'),enemy=root.querySelector('.enemy');
   const outfit={JB00:'traveler',JB01:'warrior',JB02:'mage',JB03:'bard'}[context.after.hero.job.id]||'traveler';
   const pose=(actor,key)=>{if(actor)setArt(actor,key)};
   const animate=(actor,frames,duration)=>{if(actor?.animate&&duration)context.animations.push(actor.animate(frames,{duration,easing:'ease-in-out'}))};
   const anchor=actor=>{const value=actor&&globalThis.getComputedStyle?.(actor).transform;return value&&value!=='none'?value:''};
   if(context.guardVisual&&p.stage==='battle.hero.guard'){pose(hero,`hero-${outfit}-guard`);if(p.motion==='shield')animate(hero,[{filter:'brightness(1)'},{filter:'brightness(1.35)'},{filter:'brightness(1)'}],p.durationMs);}
   if(context.guardVisual&&p.stage==='battle.nextTell'){
    const name=root.querySelector('.telegraph p:not(.muted)'),hint=root.querySelector('.telegraph p.muted');name.textContent=telegraphText({...p.telegraph,name:displayText(locale(),p.telegraph.name)});hint.textContent=displayText(locale(),p.telegraph.tell||'');
    if(p.motion==='fade')animate(name,[{opacity:.65},{opacity:1}],p.durationMs);
    if(p.motion==='sway')animate(name,[{transform:'translateX(-3px)'},{transform:'translateX(3px)'},{transform:'translateX(0)'}],p.durationMs);
    name.dataset.danger=p.dangerMotion||'';
   }
   if(p.stage==='battle.hero.prepare'){
    pose(hero,`hero-${outfit}-idle`);
    if(p.motion==='advance')animate(hero,[{transform:anchor(hero)},{transform:`${anchor(hero)} translateX(8px)`}],p.durationMs);
   }
   if(p.stage==='battle.hero.slash')pose(hero,`hero-${outfit}-attack`);
   if(p.stage==='battle.enemy.hit'){
    pose(enemy,`${context.after.battle.enemy.id.toLowerCase()}-hit`);
    context.status.textContent=effectText(p.hit,localizedContent(content,locale()));
    if(p.motion==='fade')animate(enemy,[{opacity:.65},{opacity:1}],p.durationMs);
    else if(p.motion==='impact'){
     animate(enemy,[{transform:anchor(enemy)},{transform:`${anchor(enemy)} translateX(8px)`},{transform:anchor(enemy)}],p.recoilMs);
     animate(enemy,[{filter:'brightness(1.6)'},{filter:'brightness(1)'}],p.flashMs);
    }
   }
   if(p.stage==='battle.enemy.prepare'){
    context.status.textContent=displayText(locale(),p.enemyAct.name);
    const kind=p.enemyAct.kind,enemyPose=/big|大/.test(kind)?'big':/guard|守/.test(kind)?'guard':/open|隙/.test(kind)?'open':'attack';
    pose(enemy,`${context.after.battle.enemy.id.toLowerCase()}-${enemyPose}`);
    if(p.motion==='fade')animate(enemy,[{opacity:.65},{opacity:1}],p.durationMs);
   }
   if(p.stage==='battle.hero.block'&&p.blocked>0){pose(hero,`hero-${outfit}-guard`);context.status.textContent=p.sources.map(f=>effectText(f,localizedContent(content,locale()))).filter(Boolean).join(' · ')}
   if(context.guardVisual&&p.stage==='battle.hero.hit'){root.querySelector('.stat.hp strong').textContent=`${p.hit.hp} / ${p.hit.maxHp}`;root.querySelector('.stat.hp meter').value=p.hit.hp;}
   if(p.stage==='battle.hero.hit'){pose(hero,`hero-${outfit}-${p.hit.amount>0?'hit':'guard'}`);context.status.textContent=effectText(p.hit,localizedContent(content,locale()))}
   if(p.stage==='battle.result')context.status.textContent=context.notice;
   return;
  }
  const position=p.stage==='walk'?p.to:p.stage==='trail'?p.pos:['arrival','inn.stop','move.fade'].includes(p.stage)?p.to:null;
  if(Number.isInteger(position)){
   const stagePos=p.stage==='walk'?p.from:position;stage?.update({band:Math.ceil(stagePos/20),pos:stagePos,die:context.beforeDie},false);
   for(const marker of context.path?.children||[]){const current=Number(marker.dataset.pos)===position;marker.removeAttribute('aria-current');if(current)marker.setAttribute('aria-current','step');marker.style.background=current?'#f4b942':Number(marker.dataset.pos)<position?'#d5e4ba':'transparent'}
   context.status.textContent=`${position} / 100`;
  }
  if(p.stage==='preview')context.status.textContent=`${context.after.pos} → ${p.preview.to??context.after.pos}`;
  if(p.stage==='inn.stop')context.status.textContent=`${p.to} / 100 · ${context.after.board?.currentName||''}`;

  if(p.stage==='dice.roll'||p.stage==='dice.lock')stage?.update({band:context.after.board?.band?.id||1,pos:context.after.pos,die:p.die},p.stage==='dice.roll'&&p.motion!=='fade');
  if(p.stage==='quiet')sound.scene(null);
  const hero=root.querySelector('.hero');
  if(hero?.animate&&p.durationMs&&p.motion!=='none'){
   const computed=globalThis.getComputedStyle?.(hero).transform,anchor=computed&&computed!=='none'?computed:'';
   const frames=p.motion==='arc8px'?[{transform:`${anchor} translateY(0)`},{transform:`${anchor} translateY(-8px)`,offset:.5},{transform:`${anchor} translateY(0)`}]:p.motion==='fade'?[{opacity:.65},{opacity:1}]:null;
   if(frames)context.animations.push(hero.animate(frames,{duration:p.durationMs,easing:'ease-in-out'}));
  }
 },
 onFinal({reason,sounds}){
  const context=presentationContext;if(!context)return;
  // Cancellation is navigation/lifecycle cleanup, not a second committed action.
  
  const current=presentationCurrent(context);const skipHandle=reason==='skip'&&current&&context.audio&&context.recordCues?.length&&typeof sound.prepareCommittedSkip==='function'?sound.prepareCommittedSkip(context.castleKey,sounds):null;if(context.castleVisual)stage?.arrivalVisual?.({type:reason==='finish'||reason==='skip'?'finish':'cancel',key:context.castleKey});if(context.spellVisual&&context.audio)try{sound.spell({type:reason==='finish'&&current?'finish':reason==='skip'?'skip':'cancel',key:context.castleKey,spellId:context.spellId})}catch{}if(context.kingVictoryVisual&&context.audio)try{sound.kingVictory({type:reason==='finish'&&current?'finish':reason==='skip'?'skip':'cancel',key:context.castleKey,view:context.after})}catch{}if(context.kingTurnVisual&&context.audio)try{sound.kingTurn({type:reason==='finish'&&current?'finish':'cancel',key:context.castleKey,view:context.after})}catch{/* audio cannot strand controls */}if(context.kingVisual&&context.audio)sound.king({type:reason==='finish'&&current?'finish':'cancel',key:context.castleKey});if(context.castleVisual&&context.audio&&(reason!=='finish'||!current))sound.castle({type:reason==='skip'?'skip':'cancel',key:context.castleKey});presentationContext=null;releasePresentation(context);
  if(reason==='cancel'||!current){skipHandle?.cancel();if(context.recordCues?.length)discardRecordCues(context.recordCues);return;}
  if(reason!=='finish'&&reason!=='skip'&&context.recordCues?.length)discardRecordCues(context.recordCues);
  const selectedRecordKeys=new Set(reason==='skip'?sounds.filter(s=>s.payload.recordCue).map(s=>s.key):[]);if(reason==='skip'&&context.recordCues?.length)discardRecordCues(context.recordCues.filter(c=>!selectedRecordKeys.has(c.key)));
  // A visual-only battle already handed its effects to the existing audio path.
  // Final render invalidates pending unlock work: renew only an unplayed batch,
  // never an already delivered/failed batch. Navigation cancellation returns above.
  const renewBattleSound=context.audio&&context.battleVisual&&!context.guardVisual&&!context.fleeVisual&&!context.kingTurnVisual&&!context.kingVictoryVisual&&pendingCommittedSound!==null;
  if(context.fleeSound)context.fleeSound.finalizing=true;lastAction='';notice=context.notice;preserveRecordSound=true;try{render()}finally{preserveRecordSound=false;}if(context.fleeSound)context.fleeSound.finalizing=false;
  if(renewBattleSound)scheduleCommittedSound(context.effects,`${context.after.runId}:${context.after.revision}`,context.after.runId,context.after.revision);
  if(reason==='skip'&&context.audio&&(skipHandle||!context.castleVisual&&!context.kingVisual&&!context.kingTurnVisual&&!context.kingVictoryVisual)){activeSkipSound=skipHandle;const generation=skipSoundGeneration;for(const step of sounds){const id=setTimeout(()=>{skipSoundTimers.delete(id);if(generation===skipSoundGeneration&&presentationCurrent(context)&&!session.meta.settings?.mute)try{if(skipHandle)skipHandle.play(step.key);else if(context.fleeVisual)fleeSound(context);else if(context.guardVisual)guardSound(context,step);else sound.play(step.payload.cue)}catch{}},step.atMs);skipSoundTimers.add(id)}}
  if(context.audio&&!context.resultRouteVisual&&!context.battleVisual&&!context.castleVisual&&!context.kingVisual&&!context.kingTurnVisual&&!context.kingVictoryVisual&&reason!=='skip')scheduleCommittedSound(context.effects.filter(f=>!['dieRolled','moved','levelUp','innArrived'].includes(f.t)),`${context.after.runId}:${context.after.revision}`,context.after.runId,context.after.revision);
 }
});
function cancelPresentation(){cancelSkipSound();if(pendingFleeSound&&!pendingFleeSound.finalizing)pendingFleeSound.cancelled=true;skipSoundGeneration++;for(const id of skipSoundTimers)clearTimeout(id);skipSoundTimers.clear();presentation.cancel();if(presentationContext){const context=presentationContext;presentationContext=null;releasePresentation(context)}}
function playCommittedPresentation(before,after,effects,audio,recordCues=[]){
 if(screen!=='game'||document.hidden||session?.run?.runId!==after.runId||session?.run?.revision!==after.revision)return false;
 // Castle remains static until its audio/visual bridge is connected; region requires the stage API.
 const castleVisual=effects.some(f=>f.t==='moved'&&f.stop==='castle');
 if(castleVisual&&(typeof sound.castle!=='function'||typeof stage?.arrivalVisual!=='function'))return false;
 if(before.board?.band?.id!==after.board?.band?.id&&typeof stage?.transitionRegion!=='function')return false;
 let plan=planPresentation({before,after,effects,battleVisual:true,battleGuardVisual:true,battleFleeVisual:true,resultRouteVisual:true,kingVisual:true,kingTurnVisual:true,kingSpellTimeline:true,spellVisual:true,victoryVisual:true,kingRewardVisual:true,kingExpandedRewardVisual:true,regionVisual:true,castleVisual,settings:{...session.meta.settings,reducedMotion:reduced.matches||session.meta.settings?.reducedMotion}});
 if(castleVisual){plan=appendCastleArrivalUi(plan,{...session.meta.settings,reducedMotion:reduced.matches||session.meta.settings?.reducedMotion});if(!plan)return false;}
 if(!plan.steps.length)return false;
 const resultRouteVisual=plan.mode==='result-route-light';
 if(resultRouteVisual){if(!completedKingRouteMap(after)||plan.steps.some(s=>s.kind==='sound'||s.kind==='display'&&s.payload.stage!=='result.route.light'))return false;if(lastResultRouteKey===`${after.runId}:${after.revision}`)return true;lastResultRouteKey=`${after.runId}:${after.revision}`;if(typeof document.createElementNS!=='function'){lastAction='';render(after);if(recordCues.length){if(audio)scheduleCommittedSound([],`${after.runId}:${after.revision}`,after.runId,after.revision,null,recordCues);else discardRecordCues(recordCues);}return true;}}
 const fleeVisual=plan.mode==='battle-flee',fleeTranslation=fleeVisual?translate(locale(),'ui.battle.fledNoReward'):null;
 if(fleeVisual){const hero=root.querySelector('.hero'),actors=[...root.querySelectorAll('.companion')];if(!fleeTranslation?.sourceLocale||!fleeTranslation.text||typeof sound.play!=='function'||typeof sound.unlock!=='function'||!hero||typeof hero.animate!=='function'||actors.length!==before.hero.companions.length||before.hero.companions.some(c=>!actors.some(a=>a.dataset.companionId===c.id&&typeof a.animate==='function'))||plan.steps.some(x=>x.kind==='display'&&!['battle.flee.departure','battle.flee.result'].includes(x.payload.stage)))return false;if(lastFleeKey===`${after.runId}:${after.revision}`)return true;lastFleeKey=`${after.runId}:${after.revision}`;}
 const guardVisual=plan.mode==='battle-guard';
 if(guardVisual){
  if(typeof sound.effects!=='function'||typeof sound.play!=='function'||['.hero','.enemy','.stat.hp strong','.stat.hp meter','.telegraph p:not(.muted)','.telegraph p.muted'].some(q=>!root.querySelector(q)))return false;
  const outfit={JB00:'traveler',JB01:'warrior',JB02:'mage',JB03:'bard'}[before.hero?.job?.id],enemy=after.battle?.enemy?.id?.toLowerCase(),kind=before.battle.telegraph.kind,pose=/大/.test(kind)?'big':/守/.test(kind)?'guard':/隙/.test(kind)?'open':'attack';
  if(!outfit||[`hero-${outfit}-guard`,`hero-${outfit}-hit`,`${enemy}-${pose}`].some(k=>!spriteMetrics[k])||plan.steps.some(x=>x.kind==='display'&&!['battle.hero.guard','battle.enemy.prepare','battle.hero.block','battle.hero.hit','battle.nextTell','battle.result'].includes(x.payload.stage)))return false;
  if(lastGuardKey===`${after.runId}:${after.revision}`)return true;lastGuardKey=`${after.runId}:${after.revision}`;
 }

 const kingVisual=plan.steps.some(s=>s.kind==='display'&&s.payload.stage==='king.start');if(kingVisual&&typeof sound.king!=='function')return false;
 const kingVictoryVisual=plan.mode==='king-victory-turn',victoryText=kingVictoryVisual?translate(locale(),'ui.king.defeated'):null;
 if(kingVictoryVisual&&(typeof sound.kingVictory!=='function'||!victoryText.sourceLocale||!victoryText.text))return false;
 const kingTurnVisual=plan.mode==='king-turn',crownVisual=kingTurnVisual&&plan.steps.some(s=>s.kind==='display'&&s.payload.stage.startsWith('king.crown.'));
 if(kingTurnVisual&&typeof sound.kingTurn!=='function')return false;
 const spellVisual=(kingTurnVisual||kingVictoryVisual)&&plan.steps.some(s=>s.kind==='display'&&s.payload.stage.startsWith('king.turn.spell.'));
 const spellId=spellVisual?(plan.spellId||'SP01'):null;
 const spellOutfit={JB00:'traveler',JB01:'warrior',JB02:'mage',JB03:'bard'}[before.hero?.job?.id];
 if(spellVisual&&(!spellOutfit||!spriteMetrics[`hero-${spellOutfit}-cast-prepare`]||!spriteMetrics[`hero-${spellOutfit}-cast`]))return false;
 if(spellVisual&&(typeof sound.spell!=='function'||!['SP01','SP02','SP03','SP04'].includes(spellId)||(spellId!=='SP01'&&!sound.spell.supportedIds?.includes(spellId))||plan.steps.some(s=>s.kind==='display'&&['king.turn.spell.prepare','king.turn.spell.cast'].includes(s.payload.stage)&&s.payload.effect?.id!==spellId)))return false;
 if(spellVisual){const supported=new Set(['king.turn.spell.mp','king.turn.spell.prepare','king.turn.spell.cast','king.turn.spell.hp','king.turn.spell.support','king.turn.spell.blockSource','king.turn.enemy.hit','king.turn.enemy.prepare','king.turn.hero.hit','king.turn.hero.block','king.turn.nextTell','king.crown.pause','king.crown.crack','king.crown.banner','king.crown.resume','king.victory.music','king.victory.disappear','king.victory.label','king.reward.money','king.reward.gear','king.reward.item','king.reward.levelUp']);if(plan.steps.some(s=>s.kind==='display'&&!supported.has(s.payload.stage)))return false;}
 if(spellVisual&&plan.spellId){
  if(kingVictoryVisual&&plan.steps.some(s=>s.kind==='display'&&(s.payload.stage.startsWith('king.crown.')||['king.turn.enemy.prepare','king.turn.nextTell'].includes(s.payload.stage))))return false;
  if(['.hero','.enemy','.stat.mp strong','.stat.mp meter','.stat.hp strong','.stat.hp meter','.telegraph h2','.telegraph p:not(.muted)','.telegraph p.muted'].some(selector=>!root.querySelector(selector)))return false;
  let phase=before.battle.phase.index>0?2:1;const required=[];
  for(const step of plan.steps){if(step.kind!=='display')continue;const p=step.payload;
   if(p.stage==='king.turn.spell.support'){
    const e=p.effect,comp=before.hero.companions.find(c=>c.id===e?.id&&c.role===e?.role);if(!comp||!['shield','medic','thrower','lantern'].includes(e.role))return false;
    required.push('comp-'+e.role+'-support','comp-'+e.role+'-idle');
    const actor=[...root.querySelectorAll('.companion')].find(n=>n.dataset.companionId===e.id&&n.dataset.companionRole===e.role);if(!actor||(e.role==='medic'&&(!actor.parentElement||typeof actor.animate!=='function'||typeof document.createElementNS!=='function'||typeof document.createElementNS('http://www.w3.org/2000/svg','svg').animate!=='function')))return false;
   }
   if(p.stage==='king.crown.resume')phase=2;
   if(p.stage==='king.turn.enemy.hit'||p.stage==='king.crown.resume')required.push(`dk01-p${phase}-idle`);
   if(p.stage==='king.turn.enemy.prepare'){const k=p.enemyAct.kind,pose=/big|大/.test(k)?'big':/guard|守/.test(k)?'guard':/open|隙/.test(k)?'open':'attack';required.push(`dk01-p${phase}-${pose}`)}
   if(p.stage==='king.turn.hero.hit')required.push(`hero-${spellOutfit}-${p.hit.amount>0?'hit':'guard'}`);
  }
  if(required.some(key=>!spriteMetrics[key]))return false;
 }
 const crownLabels=crownVisual?{break:translate(locale(),'ui.king.crownBreak'),next:translate(locale(),'ui.king.crownNextTurn')}:null;
 if(crownLabels&&Object.values(crownLabels).some(x=>!x.sourceLocale||!x.text))return false;
 if((kingTurnVisual||kingVictoryVisual)&&lastKingTurnKey===`${after.runId}:${after.revision}`)return true;
 if(kingTurnVisual||kingVictoryVisual)lastKingTurnKey=`${after.runId}:${after.revision}`;
 if(castleVisual&&recordCues.length)plan=addOwnedCastleBell(plan);
 if(recordCues.length){if(typeof sound.recordCue!=='function'||typeof sound.discardRecordCues!=='function'||typeof sound.prepareCommittedSkip!=='function')return false;plan=addCommittedRecordCues(plan,recordCues);}
 const renderedStageView=kingVisual||resultRouteVisual?after:before;
 const resultNotice=fleeVisual?fleeTranslation.text:kingVictoryVisual?`${victoryText.text} · ${notice}`:notice;lastAction='';notice='';if(kingVisual&&audio)sound.king({type:'start',key:`${after.runId}:${after.revision}`,view:after});render(renderedStageView);if(kingVictoryVisual&&audio)try{sound.kingVictory({type:'start',key:`${after.runId}:${after.revision}`,view:before})}catch{}if(kingTurnVisual&&audio)try{sound.kingTurn({type:'start',key:`${after.runId}:${after.revision}`,view:before})}catch{/* audio failure must not relabel a committed save */}
 if(spellVisual&&audio)try{sound.spell({type:'start',key:`${after.runId}:${after.revision}`,spellId})}catch{}
 const context={before,after,effects,audio,recordCues,resultRouteVisual,resultMap:resultRouteVisual?root.querySelector('.result-route-map'):null,fleeVisual,fleeText:fleeTranslation?.text,guardVisual,spellVisual,spellId,spellResults:[],supportOwners:new Map(),supportRestorers:[],kingVictoryVisual,victoryLabel:victoryText?.text,crownLabels:crownLabels&&{break:crownLabels.break.text,next:crownLabels.next.text},kingTurnVisual,kingVisual,castleVisual,castleKey:`${after.runId}:${after.revision}`,beforeDie:before.rolled?.die,battleVisual:plan.steps.some(s=>s.kind==='display'&&s.payload.stage.startsWith('battle.')),notice:resultNotice,controls:[...root.querySelectorAll('.actions input,.actions select,.actions button')].map(control=>[control,control.disabled]),animations:[],regionTimers:[]};
 if(resultRouteVisual){if(!context.resultMap)return false;context.controls.push(...[...root.querySelectorAll('.result button')].filter(c=>!context.controls.some(([x])=>x===c)).map(c=>[c,c.disabled]));lightResultRoute(context.resultMap,0);}
 for(const [control] of context.controls)control.disabled=true;
 const status=el('p','presentation-status',`${before.pos} / 100`);status.dataset.presentationStatus='';status.setAttribute('role','status');root.append(status);context.status=status;
 const moved=effects.find(f=>f.t==='moved');
 if(moved){const path=el('ol','presentation-path');path.dataset.presentationPath='';path.style.display='flex';path.style.gap='0.5rem';path.style.listStyle='none';
  for(let pos=moved.from;pos<=moved.to;pos++){const marker=el('li','',String(pos));marker.dataset.pos=String(pos);marker.style.padding='0.4rem';marker.style.border='1px solid currentColor';if(pos===moved.from)marker.setAttribute('aria-current','step');path.append(marker)}root.append(path);context.path=path;
 }

 const skip=el('button','quiet',actionLabel({type:'skip'}));skip.type='button';skip.addEventListener('click',()=>presentation.skip());root.append(skip);context.skip=skip;
 activeRecordCues=recordCues;presentationContext=context;stage?.update({band:renderedStageView.board?.band?.id||1,pos:renderedStageView.pos,die:renderedStageView.rolled?.die,phase:renderedStageView.phase,battleKind:renderedStageView.battle?.kind,battleStage:renderedStageView.battle?.stage,enemyId:renderedStageView.battle?.enemy?.id},false);presentation.play(plan);if(context.audio&&context.battleVisual&&!context.guardVisual&&!context.fleeVisual&&!context.kingTurnVisual&&!context.kingVictoryVisual)scheduleCommittedSound(effects,`${after.runId}:${after.revision}`,after.runId,after.revision);return true;
}
// END committed presentation bridge
function paragraph(text,cls=''){return el('p',cls,text)}
function heading(text){return el('h2','',text)}
let cachedDisplayContent,cachedDisplayLocale;
function uiContent(){const lang=locale();if(!cachedDisplayContent||cachedDisplayLocale!==lang){cachedDisplayContent=localizedContent(content,lang);cachedDisplayLocale=lang}return cachedDisplayContent}
let fallbackLocale=null;
function setFallback(value){fallbackLocale=value}
function locale(){return fallbackLocale||resolveLocale(session?.meta?.settings?.language,navigator.languages||[navigator.language])}
function tr(key,params){return translate(locale(),key,params).text}
function animated(){return !reduced.matches&&!session?.meta?.settings?.reducedMotion&&session?.meta?.settings?.animation!=='short'}
function art(id,pose='idle',className=''){const img=el('img','actor '+className);img.alt='';setArt(img,`${id}-${pose}`);return img}
function setArt(img,key){img.src=`./assets/characters/${key}.svg`;const m=spriteMetrics[key];if(m){img.style.setProperty('--sprite-ratio',m.width/m.baseWidth);img.style.setProperty('--anchor-x',`${-m.anchorX}%`);img.style.setProperty('--anchor-y',`${-m.anchorY}%`);}}
function scene(v,home=false){
 const wrap=el('section','stage '+(home?'home-stage':''));wrap.setAttribute('aria-label',msg("ui.app.scene.literal.6144904b4d"));
 const sky=el('div','sky');add(sky,el('span','sun'),el('span','cloud cloud-one'),el('span','cloud cloud-two'));add(wrap,sky);
 const canvas=el('canvas');canvas.setAttribute('aria-hidden','true');wrap.append(canvas);
 const outfit={JB00:'traveler',JB01:'warrior',JB02:'mage',JB03:'bard'}[v?.hero.job.id]||'traveler';
 const pose=lastAction==='guard'?'guard':lastAction==='attack'?'attack':lastAction==='spell'?'cast':lastAction==='move'?'walk1':v?.phase==='finished'?(v.result?.defeated?'victory':'down'):'idle';
 const hero=art(`hero-${outfit}`,pose,'hero');const p=project(-2,.24,1.5-Math.sin(1.1)*1.2);hero.style.left=p.x+'%';hero.style.top=p.y+'%';if(lastAction==='move'&&animated())hero.classList.add('walking');wrap.append(hero);
 for(const [i,c] of (v?.hero.companions||[]).entries()){const comp=art('comp-'+c.role,'idle','companion');comp.dataset.companionId=c.id;comp.dataset.companionRole=c.role;const cp=project(-3.25-i*.85,.2,1.0+i*.5);comp.style.left=cp.x+'%';comp.style.top=cp.y+'%';comp.title=c.name;wrap.append(comp)}
 if(v?.battle){const b=v.battle,kind=b.telegraph.kind;const pose=/big|大/.test(kind)?'big':/guard|守/.test(kind)?'guard':/open|隙/.test(kind)?'open':'attack';const id=b.enemy.id.toLowerCase();const en=art(id,id==='dk01'?`p${b.phase.index>0?2:1}-${pose}`:pose,'enemy');const p=project(2,.1,.3);en.style.left=p.x+'%';en.style.top=p.y+'%';wrap.append(en);}
 if(v?.rolled)wrap.append(el('strong','die-value',msg("ui.app.scene.f51ade3b85",{p0:(v.rolled.die)})));
 const ribbon=el('div','scene-ribbon',home?msg("ui.app.scene.term.828b8feda9"):tr(`ui.region.bands.${v?.board.band?.id||1}.name`));wrap.append(ribbon);
 const background=mountCastleBackground({host:wrap,canvas,sky,document,imageCache:castleImages});
 const currentStage=createStage(canvas,(status)=>{if(status==='restored'){wrap.classList.remove('no-3d');wrap.querySelector('.render-warning')?.remove();return}wrap.classList.add('no-3d');if(!wrap.querySelector('.render-warning'))wrap.append(paragraph(msg("ui.app.scene.literal.7baa586810"),'render-warning'))},background);
 stage=currentStage;requestAnimationFrame(()=>{if(stage===currentStage&&!presentation.running)currentStage.update({band:v?.board.band?.id||1,pos:v?.pos,die:v?.rolled?.die,phase:v?.phase,home,battleKind:v?.battle?.kind,battleStage:v?.battle?.stage,enemyId:v?.battle?.enemy?.id,reducedMotion:reduced.matches||session.meta.settings?.reducedMotion},lastAction==='roll'&&animated())});return wrap;
}
// BEGIN castle preparation
function renderCastleHealing(body,v){
 if(v.phase!=='gate'||v.prompt)return;
 body.append(heading(msg('ui.castle.herbs')));
 const seen=new Set(),items=v.hero.bag.items.filter(it=>{if(content.items[it.id]?.category!=='回復用'||seen.has(it.id))return false;seen.add(it.id);return true});
 if(!items.length){body.append(paragraph(msg('ui.castle.herbsEmpty'),'muted'));return}
 for(const it of items){
  body.append(paragraph(msg('ui.app.render.c938ee4c06',{p0:it.name,p1:it.category,p2:it.timing,p3:it.limit||msg('ui.app.render.term.23480562a4'),p4:it.effect}),'comparison-copy'));
  for(const a of v.actions.filter(a=>a.type==='useItem'&&a.itemId===it.id))body.append(actionForm(a,v));
 }
}
// END castle preparation
function render(presentationView=null,options={}){
 if(!preserveRecordSound||screen!=='game')cancelRecordCues();cancelSavedRecordPresentation();
 const castleContext=options.castleContext,keepCastle=!!castleContext&&castleContext===presentationContext&&castleContext.castleVisual&&presentationView===castleContext.after&&presentationView.phase==='gate';
 if(!keepCastle)cancelPresentation();
 invalidateCommittedSound();
 castleImages.prefetch(session?.view,{home:screen!=='game',committed:presentationView===null&&!presentation.running});
 setMessageLocale(locale());document.documentElement.lang=locale();
 const hadFocus=root.contains(document.activeElement);if(hadFocus)requestAnimationFrame(()=>{const focus=root.querySelector('.notice')||root.querySelector('h1')||root.querySelector('button');if(focus){focus.tabIndex=-1;focus.focus({preventScroll:true})}});stage?.dispose();clearTimeout(timer);root.replaceChildren();root.dataset.motion=animated()?'full':'reduced';
 const header=el('header','masthead');add(header,button(msg("ui.app.render.literal.624fe166e6"),()=>{screen='home';lastAction='';render()},'brand'),button(tr('ui.settings'),settings,'quiet'));root.append(header);if(locale()!=='ja')root.append(paragraph(tr('ui.translationPending'),'translation-notice'));
 if(error){const box=el('section','error');box.setAttribute('role','alert');add(box,heading(msg("ui.app.render.literal.c1fa727cb7")),paragraph(error),button(msg("ui.app.render.literal.bb1f5b26d4"),async()=>{try{await session.load();error='';lastAction='';render()}catch(e){showError(e)}}));root.append(box)}
 if(!keepCastle){sound.configure(session?.meta?.settings);sound.scene(screen==='home'||document.hidden?null:presentationView||session?.view);}
 if(!session){root.append(paragraph(msg("ui.app.render.literal.f1c2c7d3df")));return}
 if(screen==='home'){home();return}
 const v=localizedView(presentationView||session.view,content,locale());if(!v){screen='home';home();return}
 if(tab==='herbs'&&(v.phase!=='gate'||v.prompt))tab='main';
 const title=el('div','chapter');add(title,el('span','eyebrow',`${v.route.id} / ${v.route.name}`),el('h1','',`${v.pos} / 100`),el('span','roll-count',msg("ui.app.render.bdfdbc6d58",{p0:(v.rolls)})));root.append(title);
 const mapLauncher=button(msg("ui.app.render.literal.b6e1addfac"),()=>worldMap(v,mapLauncher),'quiet');
 const stats=el('section','stats');stats.setAttribute('aria-label',msg("ui.app.render.literal.998f75677a"));add(stats,stat(msg("ui.app.render.term.d6d2aa99fd"),v.hero.hp,v.hero.maxHp,'hp'),stat(msg("ui.app.render.term.522148a1fd"),v.hero.mp,v.hero.maxMp,'mp'),el('strong','gold',`${v.hero.gold} G`),el('span','level',`Lv.${v.hero.level} ${v.hero.job.name}`));root.append(stats);root.append(add(el('div','map-strip'),paragraph(msg("ui.app.render.7dcec7dac2",{p0:(v.board.nextStop===100?msg("ui.app.render.term.a4c5f93082"):msg("ui.app.render.term.6038669e41")),p1:(v.board.distanceToNextStop)})),mapLauncher));
 root.append(paragraph(msg("ui.app.render.f65841c006",{p0:(v.pos),p1:(v.board.currentName)}),'muted'));root.append(scene(v));
 if(v.battle){const t=el('section','telegraph');add(t,el('span','eyebrow',msg("ui.app.render.literal.cd7539d915")),heading(`${v.battle.enemy.name} · ${v.battle.enemy.hp}/${v.battle.enemy.maxHp}`),normalTellParagraph(v.battle),paragraph(v.battle.telegraph.tell,'muted'));if(v.battle.kind==='king'&&v.battle.phase.changed){const badge=el('span','king-phase-badge',displayText(locale(),v.battle.phase.name));badge.style.background='#E3A41C';badge.style.padding='.15rem .4rem';t.querySelector('h2').append(badge)}root.append(t)}
 if(v.battle?.temporaryStatuses?.length){const box=el('section','story');box.append(heading(msg("ui.app.render.literal.78ea180ba1")));for(const st of v.battle.temporaryStatuses)box.append(paragraph(msg("ui.app.render.f1030d5885",{p0:(st.label),p1:(st.kinds.map(k=>({attackDown:msg("ui.app.render.term.bb59eb7119"),defenseDown:msg("ui.app.render.term.862a6a31e3"),turnEndHpLoss:msg("ui.app.render.term.082937427d")}[k]||k)).join(msg("ui.app.render.term.2a21905f43"))),p2:(st.amount),p3:(st.remainingTurns)})));root.append(box)}
 if(v.battle?.forecast?.unguarded.length){const box=el('section','story');box.append(heading(msg("ui.app.render.literal.34675f17d7")),paragraph(msg("ui.app.render.literal.87577bfcf3")));for(const [k,name]of [['unguarded',msg("ui.app.render.term.2e483eb82e")],['guarded',msg("ui.app.render.term.1177af8a7d")]])for(const f of v.battle.forecast[k])box.append(paragraph(msg("ui.app.render.75ca5568df",{p0:(f.round),p1:(f.name),p2:(name),p3:(f.damage)})));root.append(box)}
 if(v.battle?.history.length){const history=el('details','battle-history');history.append(el('summary','',msg("ui.app.render.literal.518564feda")));for(const r of v.battle.history)history.append(paragraph(msg("ui.app.render.bc7ba68654",{p0:(r.round),p1:(r.dealt),p2:(r.hpLost),p3:(r.enemy)})));root.append(history)}
 const n=el('section','notice');n.setAttribute('role','status');n.setAttribute('aria-live','polite');add(n,paragraph(savedFleeResult(v)||notice||(!presentationView&&savedResult())||msg("ui.app.render.term.1e05a3a6d6")),el('small','',msg("ui.app.render.2c8ca60f57",{p0:(v.revision)})));root.append(n);const recordMarks=savedRecordMarks();if(recordMarks)root.append(recordMarks);
 if(v.event){const e=el('section','story');add(e,el('span','eyebrow',v.event.kind),heading(v.event.name),paragraph(v.event.scene));if(v.event.unscripted)add(e,paragraph(msg("ui.app.render.literal.c08e3524c9"),'warning'));if(v.event.puzzle)e.append(puzzlePanel(v.event.puzzle));root.append(e)}
 if(v.prompt?.title)root.append(heading(v.prompt.title));
 if(v.reward){const p=el('section','story');add(p,heading(msg("ui.app.render.literal.def16f80b1")),...rewardRowTexts(v.reward).map(text=>paragraph(text)));root.append(p)}
 appendSavedKingGrowth(root,v);
 if(v.phase==='gate'){
 const ribbon=el('section','story castle-ribbon');ribbon.style.background='#E3A41C';add(ribbon,heading(msg("ui.castle.title")),paragraph(msg("ui.app.render.literal.e485399357")));root.append(ribbon);
 const prep=el('nav','castle-preparation');prep.style.display='grid';prep.style.gridTemplateColumns='1fr 1fr';prep.style.gap='8px';
 for(const [label,target] of [[msg('ui.app.render.term.b5989f74c7'),'gear'],[msg('ui.castle.herbs'),'herbs'],[msg('ui.app.render.term.86e8df92c1'),'party'],[msg('ui.app.render.term.0ad8cdd51e'),'items']])prep.append(button(label,()=>{tab=target;render()},'quiet'));root.append(prep);
 }
 if(v.phase==='retryOffer')root.append(add(el('section','story'),heading(msg("ui.app.render.literal.3f905081bb")),paragraph(msg("ui.app.render.literal.3a301ecd5f"))));
 if(v.phase==='finished'){const r=el('section','story result');const resultMap=resultRouteMap(v);if(resultMap)r.append(resultMap);add(r,el('span','eyebrow',msg("ui.app.render.literal.5308c10dab")),heading(v.result?.defeated?msg("ui.app.render.term.52203486d8"):msg("ui.app.render.term.17bd5d6c12")),paragraph(msg("ui.app.render.7c9988bef2",{p0:(v.route.name),p1:(v.furthest),p2:(v.rolls)})),paragraph(msg("ui.app.render.40d7f7fcb6",{p0:(v.hero.job.name),p1:(v.hero.companions.map(c=>c.name).join(msg("ui.app.render.term.2a21905f43"))||msg("ui.app.render.term.6217280784"))})),button(msg("ui.app.render.literal.e5ed7aa5db"),()=>{screen='home';render()}));r.append(button(tr('ui.share'),()=>sharePanel(v),'share-x'));root.append(r)}
 if(v.phase==='board'||v.phase==='rolled'){const trail=el('ol','trail');for(const sq of v.board.next6){const li=el('li');add(li,el('b','',sq.pos),el('span','',sq.kind));trail.append(li)}root.append(trail)}
 const nav=el('nav','tabs');for(const [id,name] of [['main',msg("ui.app.render.term.b396c18ea5")],['items',msg("ui.app.render.term.0ad8cdd51e")],['gear',msg("ui.app.render.term.b5989f74c7")],['party',msg("ui.app.render.term.86e8df92c1")]])nav.append(button(name,()=>{tab=id;render()},tab===id?'selected':''));root.append(nav);
 const body=el('section','actions');body.setAttribute('aria-label',tab==='main'?msg("ui.app.render.term.f8f6a2fe31"):msg("ui.app.render.term.93a200dea7"));
 if(tab==='herbs')renderCastleHealing(body,v);
 if(tab==='items')add(body,heading(msg("ui.app.render.8b25e3dabf",{p0:(v.hero.bag.items.length),p1:(v.hero.bag.capacity)})),...v.hero.bag.items.map(it=>paragraph(msg("ui.app.render.c938ee4c06",{p0:(it.name),p1:(it.category),p2:(it.timing),p3:(it.limit||msg("ui.app.render.term.23480562a4")),p4:(it.effect)}),'comparison-copy')));
 if(tab==='gear'){
  add(body,heading(msg("ui.app.render.literal.1ae67cfcaf")),paragraph(msg("ui.app.render.66bc9851e6",{p0:(v.hero.attack),p1:(v.hero.defense)})),...v.hero.gear.map(g=>paragraph(msg("ui.app.render.0c81238d33",{p0:(g.equipped?msg("ui.app.render.term.bf2bbcdd02"):''),p1:(g.name),p2:(g.baseStat),p3:(g.timing||uiContent().gear[g.id]?.timing||''),p4:(g.effect||''),p5:(g.diff?msg("ui.app.module.9876c43d0b",{p0:(JSON.stringify(g.diff))}):'')}))));
 }
 if(tab==='party')add(body,heading(msg("ui.app.render.literal.f544044d74")),...v.hero.companions.map(x=>paragraph(companionSummary(x),'comparison-copy')),!v.hero.companions.length?paragraph(msg("ui.app.render.literal.cd1c50af42")):null);
 if(tab==='party'&&v.inn?.tavern){add(body,heading(msg("ui.app.render.literal.1ae4f6667f")),paragraph(msg("ui.app.render.literal.d27f9b9772")));for(const candidate of v.inn.tavern.candidates)body.append(add(el('article','candidate'),portrait(candidate,''),paragraph(companionSummary(candidate),'comparison-copy')))}
 for(const a of v.actions){if(tab==='herbs')continue;const group=['useItem','item','bagSwap','bagDecline','pickBagItem','sellItem'].includes(a.type)?'items':['equip','setSpells','sellGear'].includes(a.type)?'gear':['recruit'].includes(a.type)?'party':'main';if(group!==tab||a.type==='changeJob')continue;body.append(actionForm(a,v))}
 // Mandatory bag prompts must never be hidden behind an unrelated tab.
 if(v.prompt?.kind==='bagFull'||v.prompt?.kind==='pickBagItem'){if(tab!=='items')body.append(button(msg("ui.app.render.literal.2dcfd06424"),()=>{tab='items';render()},'primary'))}
 if(tab==='main'&&v.inn){if(v.actions.some(a=>a.type==='changeJob'))body.append(button(msg("ui.app.render.literal.6b5afaa3e9"),()=>jobs(v)));add(body,paragraph(msg("ui.app.render.c5af446173",{p0:(v.inn.rest.hp),p1:(v.inn.rest.mp)})));if(v.inn.tavern)body.append(button(msg("ui.app.render.literal.c531094d93"),()=>{tab='party';render()}))}
 root.append(body);if(v.reveals.length)root.append(reveals(v));root.append(paragraph(msg("ui.app.render.literal.4ba28e355e"),'footer'));
 if(lastAction&&animated())timer=setTimeout(()=>{lastAction='';const h=root.querySelector('.hero');if(h)setArt(h,`hero-${{JB00:'traveler',JB01:'warrior',JB02:'mage',JB03:'bard'}[v.hero.job.id]||'traveler'}-idle`);},650);
}
function stat(name,value,max,kind){const s=el('div','stat '+kind);add(s,el('span','',name),el('strong','',`${value}/${max}`));const m=el('meter');m.min=0;m.max=max;m.value=value;m.setAttribute('aria-label',name);s.append(m);return s}
function home(){
 const intro=el('section','intro');add(intro,el('span','eyebrow',msg("ui.app.home.literal.491d174221")),el('h1','',msg("ui.app.home.literal.79285a8cf1")),paragraph(tr('ui.homeIntro')));root.append(intro);root.append(scene(null,true));
 const section=el('section','home-actions');if(session.run)add(section,button(msg("ui.app.home.fd5b9323a8",{p0:(session.run.pos)}),()=>{screen='game';notice=msg("ui.app.home.term.9d9261bab9");render()},'primary'),paragraph(msg("ui.app.home.literal.97225fd46a"),'muted'));
 if(session.status==='unsupported')section.append(paragraph(msg("ui.app.home.literal.4617dfec2e"),'warning'));
 add(section,heading(tr('ui.route')));
 for(const [id,r] of Object.entries(uiContent().routes)){const b=button('',()=>confirmStart(id),'route-card');b.style.setProperty('--route',r.color);add(b,el('span','route-mark',{M:msg("ui.app.home.term.415fdf3171"),F:msg("ui.app.home.term.b92ccd5451"),B:msg("ui.app.home.term.6dd2e4b41c"),H:msg("ui.app.home.term.28656d4702")}[id]),add(el('span','route-copy'),el('strong','',r.name),el('span','',r.summary),el('small','',r.tradeoff),el('small','',Object.entries(r.slotsInTwenty).map(([kind,n])=>`${kind}${n}`).join(msg("ui.app.home.term.2a21905f43"))+msg("ui.app.home.term.d520e6c000"))));section.append(b)}
 add(section,button(tr('ui.help'),help,'quiet'),button(tr('ui.records'),records,'quiet'));section.append(button(tr('ui.share'),()=>sharePanel(),'share-x'));section.append(button(msg('ui.ranking.open'),rankingPreview,'quiet'));root.append(section);root.append(paragraph(msg("ui.app.home.literal.3041e9cda8"),'footer'));
}
function portrait(c,label){const figure=el('figure','portrait');const img=art('comp-'+c.role);img.className='portrait-image';img.alt=c.name;return add(figure,img,el('figcaption','',`${label} ${c.name}`))}
function worldMap(v,opener){sound.play('map.open');const d=modal(msg("ui.app.worldMap.term.b6e1addfac"),{closeCue:'map.close',opener});add(d,paragraph(msg("ui.app.worldMap.250a2572a7",{p0:(v.route.name),p1:(v.pos),p2:(v.board.band.name)})));const grid=el('ol','world-map');let current=null;for(const tile of mapTiles(v)){const li=el('li',(tile.current?'current ':tile.visited?'visited ':'')+(tile.inn?'inn':''));li.setAttribute('aria-label',tile.label+(tile.current?msg("ui.app.worldMap.term.c4fd09e10a"):''));li.title=tile.name;if(tile.current){current=li;li.setAttribute('aria-current','location')}add(li,el('b','',tile.pos),tile.inn?el('small','',msg("ui.app.worldMap.literal.34eb96f43d")):tile.pos===100?el('small','',msg("ui.app.worldMap.literal.76f47004cc")):null);grid.append(li)}add(d,grid,paragraph(msg("ui.app.worldMap.literal.7d01e2c98c")));const close=el('button','primary map-close',msg('ui.app.modal.literal.f6c244f988'));close.type='button';close.style.width='100%';close.style.minHeight='56px';close.addEventListener('click',()=>d.close());d.append(close);current?.scrollIntoView?.({block:'center',inline:'nearest',behavior:reduced.matches||session?.meta?.settings?.reducedMotion?'instant':'smooth'});}
function jobs(v){const d=modal(msg("ui.app.jobs.term.a9e0b26002"));add(d,paragraph(msg("ui.app.jobs.83411198f0",{p0:(v.hero.job.name)})));const preview=el('div','job-preview');d.append(preview);function choose(id){sound.play('try.on');const job=uiContent().jobs[id],img=art('hero-'+({JB00:'traveler',JB01:'warrior',JB02:'mage',JB03:'bard'}[id]));img.className='try-on';preview.replaceChildren(img,heading(job.name),paragraph(job.text),actionForm(v.actions.find(a=>a.type==='changeJob'&&a.jobId===id),v));}for(const j of v.inn.jobs)d.append(button(msg("ui.app.choose.4363446e2e",{p0:(j.name)}),()=>choose(j.id),'quiet'));d.append(button(msg("ui.app.choose.literal.8a4ba79f47"),()=>d.close(),'quiet'));choose(v.hero.job.id);}
function help(){const d=modal(msg("ui.app.help.term.16679487f2"));add(d,paragraph(msg("ui.app.help.literal.dd817f4395")),paragraph(msg("ui.app.help.literal.298c2d3866")),paragraph(msg("ui.app.help.literal.9bb2c9eceb")),paragraph(msg("ui.app.help.literal.4661ec53d0")));}
function modal(title,{closeCue='ui.cancel',opener=null}={}){sound.menu(true);const d=el('dialog');const h=heading(title);h.id='dialog-'+crypto.randomUUID();d.setAttribute('aria-labelledby',h.id);add(d,h);root.append(d);const close=closeCue==='map.close'?el('button','quiet',msg("ui.app.modal.literal.f6c244f988")):button(msg("ui.app.modal.literal.f6c244f988"),()=>d.close(),'quiet');if(closeCue==='map.close'){close.type='button';close.addEventListener('click',()=>d.close())}d.append(close);let closed=false;d.addEventListener('close',()=>{if(closed)return;closed=true;sound.menu(session?.view?.phase==='inn');sound.play(closeCue);d.remove();if(closeCue==='map.close'&&opener?.isConnected&&typeof opener.focus==='function')opener.focus({preventScroll:true})});d.showModal();if(activeTap)activeTap.dialog=d;return d}
function confirmStart(route){if(session.run||session.status==='unsupported'){const d=modal(msg("ui.app.confirmStart.term.f60f49b1c2"));add(d,paragraph(msg("ui.app.confirmStart.3b2526dd1a",{p0:(session.run?session.run.pos+msg('ui.app.confirmStart.runSuffix'):msg("ui.app.confirmStart.term.3eac9e4bd4")),p1:(uiContent().routes[route].name)})),button(msg("ui.app.confirmStart.literal.7f915bacbc"),()=>{d.close();start(route,true)},'primary'));}else start(route,false)}
async function start(route,confirmed){try{const soundGeneration=committedSoundGeneration;prepareCommittedSound({preserveTap:true});await session.start(route,confirmed);savedRecordLedger=null;cancelSavedRecordPresentation();const allowCommittedSound=soundGeneration===committedSoundGeneration,runId=session.run.runId,revision=session.run.revision;screen='game';tab='main';notice=msg("ui.app.start.term.ed4b98dc3e");lastAction='';render();if(allowCommittedSound)scheduleCommittedSound([],`${runId}:${revision}`,runId,revision,'depart')}catch(e){showError(e)}}
function showError(e){lastAction='';error=({stale_revision:msg("ui.app.showError.term.d590327e68"),stale_meta_revision:msg("ui.app.showError.term.a0ade14b58"),run_replaced:msg("ui.app.showError.term.67d55c7ff2"),unsupported_record:msg("ui.app.showError.term.4cbfc7c680")}[e.code]||msg("ui.app.showError.term.9a3bad2d43"))+` (${e.code||e.message})`;render()}
function actionForm(a,v){
 const form=el('form','action-card');let targetChecks=[];const name=actionLabel(a,localizedContent(content,locale()));const fields=[];if(a.cost&&typeof a.cost==='object')form.append(paragraph(Object.entries(a.cost).filter(([k,n])=>['gold','mp','hp'].includes(k)&&typeof n==='number'&&n>0).map(([k,n])=>msg("ui.app.actionForm.057c340753",{p0:({gold:msg("ui.app.actionForm.term.e8bafc9506"),mp:msg("ui.app.actionForm.term.522148a1fd"),hp:msg("ui.app.actionForm.term.d6d2aa99fd")}[k]),p1:(n)})).join(' / '),'muted'));
 function field(spec,label,key){const row=el('label','input-row');row.append(el('span','',label));let input;if(spec.type==='enum'){input=el('select');for(const x of spec.values){const opt=el('option','',(x==='なし'?msg('ui.app.actionForm.noAid'):null)||spec.labels?.[x]||v.event?.puzzle?.labels?.[x]||uiContent().items[x]?.name||uiContent().companions[x]?.name||({hp:msg("ui.app.field.term.d6d2aa99fd"),mp:msg("ui.app.field.term.522148a1fd"),attack:msg("ui.app.field.term.81b406f806"),guard:msg("ui.app.field.term.8885e4f225")}[x])||x);opt.value=String(x);input.append(opt)}}else if(spec.type==='string'&&spec.id==='newItemId'){input=el('select');for(const item of Object.values(uiContent().items)){const o=el('option','',item.name);o.value=item.id;input.append(o)}}else if(spec.type==='sequence'){input=el('input');input.type='hidden';const chosen=spec.of.map((x,i)=>v.event?.puzzle?.fixedPrefix?.[i]??x);for(let i=0;i<spec.of.length;i++){const pick=el('select');pick.setAttribute('aria-label',msg("ui.app.field.c2468207e2",{p0:(i+1)}));for(const id of spec.of){const o=el('option','',v.event?.puzzle?.labels?.[id]||id);o.value=String(id);pick.append(o)}pick.value=String(chosen[i]);pick.disabled=i<(v.event?.puzzle?.fixedPrefix?.length||0);pick.onchange=()=>{chosen[i]=pick.value;input.value=chosen.join(',')};row.append(pick)}input.value=chosen.join(',')}else if(spec.type==='matching'){input=el('input');input.type='hidden';const pairs={};for(const k of spec.of){const pick=el('select');row.append(el('span','',v.event?.puzzle?.labels?.[k]||k));for(const target of spec.targets){const o=el('option','',v.event?.puzzle?.labels?.[target]||target);o.value=target;pick.append(o)}pairs[k]=v.event?.puzzle?.fixedPairs?.[k]??spec.targets[0];pick.value=pairs[k];pick.disabled=Object.hasOwn(v.event?.puzzle?.fixedPairs||{},k);pick.onchange=()=>{pairs[k]=pick.value;input.value=JSON.stringify(pairs)};row.append(pick)}input.value=JSON.stringify(pairs)}else{input=el('input');input.type=spec.type==='int'?'number':'text';if(spec.type==='int'){input.min=spec.min;input.max=spec.max;input.step=1;input.value=spec.min}else input.placeholder=spec.type==='sequence'?spec.of.join(', '):spec.type==='ints'?msg("ui.app.field.182703a068",{p0:(spec.minCount),p1:(spec.maxCount),p2:(spec.min),p3:(spec.max)}):''}input.required=!spec.optional;row.append(input);form.append(row);fields.push({spec,input,key})}
 if(a.itemOptions?.length){field({type:'enum',values:['なし',...a.itemOptions.map(o=>o.itemId)]},msg("ui.app.field.term.bbfa5ff846"),'actionAid');for(const option of a.itemOptions)for(const input of option.inputs||[])field(input,msg("ui.app.field.bd0857ba8b",{p0:(option.name),p1:(inputLabel(input.id))}),'aid.'+option.itemId+'.'+input.id)}
 if(a.input)field(a.input,a.type==='answerPuzzle'?msg("ui.app.field.term.20a04e7533"):msg("ui.app.field.aa465ce801",{}) ,a.type==='answerPuzzle'?'answer':'input');
 for(const s of a.inputs||[])field(s,inputLabel(s.id),'params.'+s.id);
 if(a.excludedTarget!==undefined&&a.excludedTarget!==null)form.append(paragraph(msg("ui.app.field.bcdcee45fa",{p0:(a.excludedTarget+1)})));
 if(a.needsTargets){for(const target of v.battle.targets){const input=el('input');input.type='checkbox';targetChecks.push({input,index:target.index});input.onchange=()=>{if(targetChecks.filter(x=>x.input.checked).length>2)input.checked=false};form.append(add(el('label','check'),input,el('span','',msg("ui.app.field.3160f4515d",{p0:(target.index+1),p1:(target.footprint==='fresh'?msg("ui.app.field.term.08468ea02e"):msg("ui.app.field.term.4f0311747e"))}))))}}
 if(a.needsTarget)field({type:'enum',values:v.battle.targets.map(t=>t.index),labels:Object.fromEntries(v.battle.targets.map(t=>[t.index,msg("ui.app.field.655d98e002",{p0:(t.index+1),p1:(t.footprint==='fresh'?msg("ui.app.field.term.08468ea02e"):msg("ui.app.field.term.4f0311747e"))})]))},msg("ui.app.field.term.4fd2597dc0"),'target');
 if(a.needsReplace){const faces=el('div','replacement-faces');const incoming=uiContent().companions[a.companionId];add(faces,portrait(incoming,msg("ui.app.field.term.3c2a5d9e66")),...v.hero.companions.map(c=>portrait(c,msg("ui.app.field.term.58603adad8"))));form.append(faces);field({type:'enum',values:v.hero.companions.map(c=>c.id)},msg("ui.app.field.term.699be4b745"),'replaceId')}
 let spellChecks=[];
 if(a.type==='setSpells'){for(const sp of v.hero.spells.learned){const lab=el('label','check');const input=el('input');input.type='checkbox';input.checked=sp.prepared;add(lab,input,el('span','',`${sp.name}：${sp.text}`));form.append(lab);spellChecks.push({input,id:sp.id})}if(!spellChecks.length)form.append(paragraph(msg("ui.app.field.literal.31da45f17e"),'muted'))}
 const b=el('button',(['roll','move','attack','challengeKing','continue'].includes(a.type)?'primary':'')+(a.type==='guard'?' guard':''),name);b.type='submit';b.disabled=!a.enabled||a.type==='skipUnscripted'||(a.type==='setSpells'&&!spellChecks.length)||!!error;
 if(v.phase==='gate'&&a.type==='challengeKing')form.append(paragraph(msg('ui.castle.noFlee'),'muted'));
 add(form,b);if(!a.enabled)form.append(paragraph(a.reasonText||({same:msg("ui.app.field.term.2ba9627cc7"),equipped:msg("ui.app.field.term.5a430d6bb0"),recruitUsed:msg("ui.app.field.term.eaa4774367")}[a.reason]||msg("ui.app.field.term.96105c98cf")),'reason'));
 if(a.preview&&a.type==='rest')form.append(paragraph(msg("ui.app.field.a7d2446f4f",{p0:(a.preview.hp>=0?'+':''),p1:(a.preview.hp),p2:(a.preview.mp>=0?'+':''),p3:(a.preview.mp),p4:(a.preview.gold>=0?'+':''),p5:(a.preview.gold)}),'muted'));
 if(a.preview?.discarded)form.append(paragraph(msg("ui.app.field.f4d7448414",{p0:(a.preview.discarded)}),'muted'));
 if(a.afterGold!==undefined)form.append(paragraph(msg("ui.app.field.f51588c994",{p0:(a.afterGold),p1:(a.shortfall?msg("ui.app.module.372ed15a46",{p0:(a.shortfall)}):'')}),'muted'));
 if(a.diff)form.append(paragraph(msg("ui.app.field.f0660cb661",{p0:(a.diff.before),p1:(a.diff.after),p2:(a.diff.delta>=0?'+':''),p3:(a.diff.delta)}),'muted'));
 if(a.type==='pickChest'){const c=v.chest.candidates.find(c=>c.index===a.index);form.append(paragraph(`${c?.name||''}：${c?.effect||c?.text||''}`))}
 form.addEventListener('submit',async e=>{e.preventDefault();if(session.busy||presentation.running||b.disabled)return;try{const action={...a};if(a.needsTargets){action.targets=targetChecks.filter(t=>t.input.checked).map(t=>t.index);if(!action.targets.length)throw Error(msg("ui.app.field.literal.89a49ca24d"))}for(const f of fields){if(f.key.startsWith('aid.')&&fields.find(x=>x.key==='actionAid')?.input.value!==f.key.split('.')[1])continue;if(f.spec.optional&&!f.input.value.trim())continue;const val=parseInput(f.spec,f.input.value);if(f.key.startsWith('aid.'))action.params={...action.params,[f.key.split('.')[2]]:val};else if(f.key.startsWith('params.'))action.params={...action.params,[f.key.slice(7)]:val};else action[f.key]=val}if(action.actionAid&&action.actionAid!=='なし')action.itemId=action.actionAid;delete action.actionAid;if(a.type==='setSpells'){action.ids=spellChecks.filter(s=>s.input.checked).map(s=>s.id);if(action.ids.length>v.hero.spells.slots)throw Error(msg("ui.app.field.38b970aa00",{p0:(v.hero.spells.slots)}))}b.disabled=true;cancelSavedRecordPresentation();const recordBefore=captureSavedRecordSnapshot();const soundGeneration=committedSoundGeneration;prepareCommittedSound();const before=structuredClone(session.view);const fx=await session.act(action);const after=structuredClone(session.view);const recordReceipt=acceptSavedRecordReceipt(recordBefore,fx);const allowCommittedSound=soundGeneration===committedSoundGeneration;const effectRunId=session.run.runId,effectRevision=session.run.revision;const recordCues=recordCuesForReceipt(recordReceipt);lastAction=fx.length?a.type:'';notice=fx.map(f=>effectText(f,localizedContent(content,locale()))).filter(Boolean).join(' · ')||msg("ui.app.field.term.a517fdcb64");error='';if(allowCommittedSound&&playCommittedPresentation(before,after,fx,allowCommittedSound,recordCues)){deliverSavedRecordPresentation(recordReceipt);return;}render();if(allowCommittedSound)scheduleCommittedSound(fx,`${effectRunId}:${effectRevision}`,effectRunId,effectRevision,null,recordCues);else discardRecordCues(recordCues);deliverSavedRecordPresentation(recordReceipt);}catch(err){showError(err)}});return form;
}
function savedResult(){const r=session.meta.uiLastResult;return r&&r.runId===session.run?.runId&&r.revision===session.run?.revision?r.effects.map(f=>effectText(f,localizedContent(content,locale()))).filter(Boolean).join(' · '):''}
function reveals(v){const panel=el('details','story');panel.append(el('summary','',msg("ui.app.reveals.literal.1f0b8387d4")));for(const rec of v.reveals){const d=rec.data||{};panel.append(paragraph(msg("ui.app.reveals.2ecfe17754",{p0:(rec.turn)}),'eyebrow'));if(rec.kind==='ownedSwordComparison'||rec.kind==='ownedArmorComparison'){panel.append(paragraph(msg("ui.app.reveals.literal.89c2708c66")));const checks=[];for(const sword of d.swords||d.armor){const box=el('input');box.type='checkbox';const label=add(el('label','check'),box,el('span','comparison-copy',comparisonText(sword)));checks.push(box);box.onchange=()=>{if(checks.filter(x=>x.checked).length>2)box.checked=false};panel.append(label)}}else if(d.text){panel.append(paragraph(d.text))}else if('count' in d){panel.append(paragraph(msg("ui.app.reveals.242ff05421",{p0:(d.count)})));for(const sq of d.squares||[])panel.append(paragraph(msg("ui.app.reveals.8d3671ff6e",{p0:(sq.pos),p1:(sq.name)})))}else if('square' in d){if(d.enemyName)panel.append(paragraph(d.enemyName));if(d.firstAction)panel.append(paragraph(`${d.firstAction.name}：${d.firstAction.tell||''}`));if(d.reward)panel.append(paragraph(msg("ui.app.reveals.564d3fc158",{p0:(d.reward.gold),p1:(d.reward.xp)})));for(const candidate of d.candidates||[])panel.append(paragraph(candidate.name));for(const option of d.options||[])panel.append(previewResult(option));panel.append(paragraph(d.square?msg("ui.app.reveals.678663b34e",{p0:(d.square.pos),p1:(d.square.kind),p2:(d.square.name)}):msg("ui.app.reveals.term.5349965875")))}else if(d.outcomes){d.outcomes.forEach(x=>panel.append(paragraph(msg("ui.app.reveals.2c7aa1a6cb",{p0:(x.die),p1:(x.to),p2:(x.kind)}))))}else if(d.name){panel.append(paragraph(`${d.name}：${d.tell||''}`))}else{const rows=d.squares||d.battles||d.traps||[];if(!rows.length)panel.append(paragraph(msg("ui.app.reveals.literal.f2c0caf487")));for(const x of rows){panel.append(paragraph(msg("ui.app.reveals.a31812f03c",{p0:(x.pos),p1:(x.enemyName||x.name),p2:(x.kind)})));for(const a of x.firstActions||[])panel.append(paragraph(`${a.name}：${a.tell}`));for(const o of x.options||[])panel.append(paragraph(o.label))}}}return panel}
function audioSettings(d,settings){const group=el('div');const mute=el('input');mute.type='checkbox';mute.name='mute';mute.checked=!!settings.mute;group.append(add(el('label','check'),mute,el('span','',msg("ui.app.audioSettings.literal.0500c422a8"))));for(const [key,label,value] of [['masterVolume',msg("ui.app.audioSettings.term.982348c769"),.8],['bgmVolume',msg("ui.app.audioSettings.term.dd5f9601f1"),.5],['seVolume',msg("ui.app.audioSettings.term.edcfda31c2"),.8]]){const input=el('input');input.type='range';input.min=0;input.max=1;input.step=.05;input.name=key;input.value=settings[key]??value;group.append(add(el('label','input-row'),el('span','',label),input))}return group}
function settings(){cancelSkipSound();cancelRecordCues();cancelSavedRecordPresentation();const wasPresenting=presentation.running;cancelPresentation();if(wasPresenting)render();const d=modal(msg("ui.app.settings.term.49b0ac0f54"));const settings=session?.meta?.settings||{};const close=d.querySelector('button');let pending=false;const language=el('select');LOCALES.forEach((code,i)=>{const o=el('option','',LOCALE_NAMES[i]);o.value=code;language.append(o)});const preferredLanguage=resolveLocale(settings.language,navigator.languages||[navigator.language]);language.value=preferredLanguage;d.append(add(el('label','input-row'),el('span','',tr('ui.language')),language));const coverage=missingMessages(locale());d.append(paragraph(msg('ui.app.settings.coverage',{p0:coverage.translated,p1:coverage.total}),'muted'));const select=el('select');for(const [v,t] of [['standard',msg("ui.app.settings.term.8320984b0b")],['short',msg("ui.app.settings.term.6e7fdac4f9")]]){const o=el('option','',t);o.value=v;select.append(o)}select.value=settings.animation||'standard';const label=el('label','input-row',msg("ui.app.settings.literal.909c6a9dea"));label.append(select);const reducedCheck=el('input');reducedCheck.type='checkbox';reducedCheck.checked=!!settings.reducedMotion;add(d,label,add(el('label','check'),reducedCheck,el('span','',msg("ui.app.settings.literal.08b0f55b18"))),audioSettings(d,settings),paragraph(msg("ui.app.settings.literal.8b3a5cfc45"),'muted'),button(msg("ui.app.settings.literal.0d19921a25"),()=>{sound.play('shield');sound.play('bell',.6)}),button(msg("ui.app.settings.literal.b4fd2d361a"),async()=>{
 if(pending||session.busy||!d.open||!d.isConnected)return;
 pending=true;
 try{
  const changesLanguage=!fallbackLocale||language.value!==preferredLanguage;
  const snapshot=Object.freeze({...(changesLanguage?{language:language.value}:{}),animation:select.value,reducedMotion:reducedCheck.checked,mute:d.querySelector('[name=mute]').checked,masterVolume:Number(d.querySelector('[name=masterVolume]').value),bgmVolume:Number(d.querySelector('[name=bgmVolume]').value),seVolume:Number(d.querySelector('[name=seVolume]').value)});
  for(const control of d.querySelectorAll('input,select,button'))if(control!==close)control.disabled=true;
  if(changesLanguage)await loadMessages(snapshot.language);
  if(!d.open||!d.isConnected)return;
  await session.settings(snapshot);
  if(changesLanguage)setFallback(null);
  sound.configure(session.meta.settings);
  if(!d.open||!d.isConnected)return;
  d.close();render();
 }catch(e){
  if(!d.open||!d.isConnected)return;
  d.close();showError(e);
 }finally{pending=false}
}));}
function records(){const d=modal(msg("ui.app.records.term.9200344787"));add(d,heading(msg("ui.app.records.literal.2283159eea")));for(const [route,b] of Object.entries(session.meta.bests))add(d,paragraph(msg("ui.app.records.bf06ba048e",{p0:(route==='all'?msg("ui.app.records.term.23dad3af9c"):uiContent().routes[route]?.name||route),p1:(b.furthest),p2:(b.rolls),p3:(b.defeated?msg("ui.app.records.term.327f2f0129"):'')})));for(const [kind,title,defs] of [['enemies',msg("ui.app.records.term.0361316afc"),uiContent().enemies],['companions',msg("ui.app.records.term.294293277d"),uiContent().companions],['gear',msg("ui.app.records.term.2987781405"),uiContent().gear]])add(d,heading(title),paragraph(session.meta.dex[kind].map(id=>defs[id]?.name||id).join(msg("ui.app.records.term.2a21905f43"))||msg("ui.app.records.term.c2c66b3886")));}
try{content=await loadContentInBrowser('./');session=createSession(content,createIndexedDbStore({name:'yusha100-publication-preview-v1'}));await session.load();const preferred=locale();try{await loadMessages(preferred)}catch(e){if(preferred==='ja')throw e;await loadMessages('ja');setFallback('ja')}render()}catch(e){root.replaceChildren(heading(msg("ui.app.records.literal.46dff6e77f")),paragraph(msg("ui.app.records.literal.de1412f35a")),paragraph(e.message,'error'))}
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelSkipSound();cancelRecordCues();cancelSavedRecordPresentation();const wasPresenting=presentation.running;cancelPresentation();if(wasPresenting)render();invalidateCommittedSound();lastAction='';clearTimeout(timer)}});

function puzzlePanel(p){const box=el('div','puzzle-display');if(p.prompt)box.append(paragraph(p.prompt));for(const [key,value] of Object.entries(p.display||{})){if(Array.isArray(value)&&value.every(Array.isArray)){box.append(heading(key==='reference'?msg("ui.app.puzzlePanel.term.24ab53a2bb"):msg("ui.app.puzzlePanel.term.c820c1e60f")));const grid=el('div','puzzle-grid');for(const row of value)for(const lit of row)grid.append(el('span',lit?'lit':'dark',lit?msg("ui.app.puzzlePanel.term.73b972d71b"):msg("ui.app.puzzlePanel.term.140ede2642")));box.append(grid)}else box.append(paragraph(msg("ui.app.puzzlePanel.425f470c0b",{p0:({cupCount:msg("ui.app.puzzlePanel.term.3d191b6233"),unit:msg("ui.app.puzzlePanel.term.c2c1bfe05a"),scaleMax:msg("ui.app.puzzlePanel.term.118b3ffebc")}[key]||key),p1:(value)})))}for(const [id,label] of Object.entries(p.labels||{}))box.append(paragraph(label,'muted'));for(const hint of p.hints||[])box.append(paragraph(typeof hint==='string'?hint:puzzleHintText(hint,p.labels)));if(p.eliminated?.length)box.append(paragraph(msg("ui.app.puzzlePanel.literal.2bd7c73f69")+p.eliminated.map(x=>p.labels[x]||x).join('、')));if(p.fixedPrefix?.length)box.append(paragraph(msg("ui.app.puzzlePanel.literal.073be543a8")+p.fixedPrefix.map(x=>p.labels[x]||x).join(' → ')));if(Object.keys(p.fixedPairs||{}).length)box.append(paragraph(msg("ui.app.puzzlePanel.literal.b3ee49dd39")+Object.entries(p.fixedPairs).map(([a,b])=>`${p.labels[a]||a} → ${p.labels[b]||b}`).join('、')));if(p.pendingWrong)box.append(paragraph(msg("ui.app.puzzlePanel.literal.c32448f77b")));return box}

function inputLabel(id){return {statusId:msg("ui.app.inputLabel.term.c39536b5d4"),attackId:msg("ui.app.inputLabel.term.2946d1a6e3"),defenseId:msg("ui.app.inputLabel.term.72c18b8836"),declaration:msg("ui.app.inputLabel.term.e8a5a465a6"),which:msg("ui.app.inputLabel.term.a7ee428ae7"),hpRooms:msg("ui.app.inputLabel.term.c8c4cefc60"),partner:msg("ui.app.inputLabel.term.a2e319e114"),pos:msg("ui.app.inputLabel.term.300439317c"),kind:msg("ui.app.inputLabel.term.9596ee6f51"),substituteId:msg("ui.app.inputLabel.term.15971d7654"),groups:msg("ui.app.inputLabel.term.bad37f8166"),mp:msg("ui.app.inputLabel.term.3b81999de7"),stat:msg("ui.app.inputLabel.term.a7ee428ae7"),answer:msg("ui.app.inputLabel.term.c83db6da15"),values:msg("ui.app.inputLabel.term.fcff419205"),newItemId:msg("ui.app.inputLabel.term.cc19e2407a"),itemId:msg("ui.app.inputLabel.term.02b85d978f"),target:msg("ui.app.inputLabel.term.2882b00920"),order:msg("ui.app.inputLabel.term.8de09130b2"),amount:msg("ui.app.inputLabel.term.7a961d6b2d"),index:msg("ui.app.inputLabel.term.7920e38dd6"),die:msg("ui.app.inputLabel.term.26146f5dc5")}[id]||msg("ui.app.inputLabel.term.0cdffca379")}

function previewResult(o){const box=el('div','preview-result');if(o.label)box.append(heading(o.label));if(o.die!==undefined)box.append(paragraph(msg("ui.app.previewResult.f9cf40edb7",{p0:(o.die)})));if(o.input!==undefined)box.append(paragraph(msg("ui.app.previewResult.537a8bb364",{p0:(o.input)})));if(o.enabled===false)box.append(paragraph(msg("ui.app.previewResult.literal.1167aecc2e")));else if(o.hp!==undefined)box.append(paragraph(msg("ui.app.previewResult.731021acf4",{p0:(o.hp>=0?'+':''),p1:(o.hp),p2:(o.mp>=0?'+':''),p3:(o.mp),p4:(o.gold>=0?'+':''),p5:(o.gold)})));for(const row of [...(o.variants||[]),...(o.choices||[]),...(o.outcomes||[])])box.append(previewResult(row));if(o.pending)box.append(paragraph(msg("ui.app.previewResult.literal.1ac10759b5")));return box}

function sharePanel(v=null){const draft=shareDraft({locale:locale(),url:CANONICAL_URL,result:v?{pos:v.furthest,rolls:v.rolls,defeated:!!v.result?.defeated}:null});const d=modal(tr('ui.shareDraft'));const text=el('textarea');text.value=draft.text;text.readOnly=true;text.setAttribute('aria-label',tr('ui.shareDraft'));d.append(text);d.append(paragraph(draft.ready?msg('ui.app.sharePanel.localOnly'):tr('ui.urlPending')));const copy=button(tr('ui.copy'),async()=>{try{await navigator.clipboard.writeText(draft.text);copy.textContent=msg('ui.app.sharePanel.copied')}catch{copy.textContent=msg('ui.app.sharePanel.copyUnavailable')}});copy.disabled=!draft.ready;d.append(copy);}

function rankingPreview(){const d=modal(msg('ui.ranking.title'));d.append(paragraph(msg('ui.ranking.disclaimer')));d.append(paragraph(msg('ui.ranking.condition')));const name=el('input');name.maxLength=40;name.autocomplete='off';const note=paragraph('');d.append(add(el('label','input-row'),el('span','',msg('ui.ranking.name')),name));d.append(button(msg('ui.ranking.freeze'),()=>{const preview=namePreview(name.value);note.textContent=preview.eligible?msg('ui.ranking.named',{p0:preview.name}):msg('ui.ranking.anonymous')}));d.append(note);const board=createLocalBoard(),area=el('section');area.setAttribute('aria-live','polite');d.append(area);function draw(){const state=board.state;area.replaceChildren();if(state.status==='loading')area.append(paragraph(msg('ui.ranking.loading')));if(state.status==='empty')area.append(paragraph(msg('ui.ranking.empty')));if(state.status==='error')area.append(paragraph(msg('ui.ranking.error')));for(const row of state.rows)area.append(paragraph(msg('ui.ranking.row',{p0:row.rank,p1:row.ticket.name,p2:row.result.furthest,p3:row.result.rolls})));}async function reload(){const p=board.load('unconfigured-local-preview');draw();await p;draw()}d.append(button(msg('ui.ranking.retry'),reload));reload();}

