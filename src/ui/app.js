import {planPresentation,createPresentationPlayer} from './presentation-timeline.js';
import {createLocalBoard,namePreview} from './ranking.js';
import {msg,setMessageLocale} from './i18n.js';
import {LOCALES,LOCALE_NAMES,resolveLocale,translate,auditCatalog,UI_KEYS,contentKeys,shareDraft,loadMessages,displayText,missingMessages,localizedView,localizedContent} from './i18n.js';
import {spriteMetrics} from '../../assets/characters/metrics.js';
import {loadContentInBrowser} from '../content/browser.js';
import {createIndexedDbStore} from '../save/index.js';
import {createAudio} from './audio.js';
import {createSession} from './session.js';
import {createStage,project} from './stage.js';
import {actionLabel,telegraphText,parseInput,effectText,companionSummary,comparisonText,mapTiles,puzzleHintText} from './presentation.js';
const CANONICAL_URL=null; // Requires owner-confirmed official URL; never infer from localhost.
const sound=createAudio();
const root=document.querySelector('#app');let content,session,stage,screen='home',tab='main',notice='',error='',lastAction='',timer=0;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
const add=(p,...xs)=>{xs.filter(Boolean).forEach(x=>p.append(x));return p};
function button(text,fn,cls=''){const b=el('button',cls,text);b.type='button';b.addEventListener('click',()=>{sound.unlock().then(()=>sound.play('ui.tap'));fn()});return b}
let committedSoundGeneration=0,committedSoundPreparation=null,pendingCommittedSound=null;
function invalidateCommittedSound(){committedSoundGeneration++;pendingCommittedSound=null;}
function prepareCommittedSound(){if(committedSoundPreparation)return;const preparation={};committedSoundPreparation=preparation;try{Promise.resolve(sound.unlock()).then(()=>{if(committedSoundPreparation!==preparation)return;committedSoundPreparation=null;const play=pendingCommittedSound;pendingCommittedSound=null;play?.();},()=>{if(committedSoundPreparation===preparation){committedSoundPreparation=null;pendingCommittedSound=null;}});}catch{if(committedSoundPreparation===preparation){committedSoundPreparation=null;pendingCommittedSound=null;}}}
function scheduleCommittedSound(fx,key,runId,revision,cue=null){if((!fx.length&&!cue)||document.hidden||screen!=='game'||session?.meta?.settings?.mute)return;const generation=committedSoundGeneration;const play=()=>{if(generation!==committedSoundGeneration||document.hidden||screen!=='game'||session?.meta?.settings?.mute||session?.run?.runId!==runId||session?.run?.revision!==revision)return;try{if(cue)sound.play(cue);else sound.effects(fx,key)}catch{/* audio failure must not relabel a committed save */}};if(committedSoundPreparation)pendingCommittedSound=play;else play();}
// BEGIN committed presentation bridge
// Visual integration: board and strict nonterminal normal attack only. No dispatch or persistence.
// Battle audio retains the existing committed-effects path, not visual-stage synchronization.
let presentationContext=null,skipSoundGeneration=0;
const skipSoundTimers=new Set();
function releasePresentation(context){
 for(const [control,disabled] of context.controls)control.disabled=disabled;
 for(const animation of context.animations)animation.cancel();
 context.skip?.remove();context.path?.remove();context.status?.remove();delete root.dataset.presentation;
}
function presentationCurrent(context){return context&&screen==='game'&&!document.hidden&&session?.run?.runId===context.after.runId&&session?.run?.revision===context.after.revision}
function presentationSound(cue){if(presentationCurrent(presentationContext)&&presentationContext.audio&&!session.meta.settings?.mute)try{sound.play(cue)}catch{/* audio cannot strand a confirmed result */}}
const presentation=createPresentationPlayer({clock:{setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id)},
 onStep(step){
  const context=presentationContext;if(!presentationCurrent(context)){cancelPresentation();return}
  if(step.kind==='sound'){presentationSound(step.payload.cue);return}
  if(step.kind!=='display')return;
  const p=step.payload;root.dataset.presentation=p.stage;
  if(p.stage.startsWith('battle.')){
   const hero=root.querySelector('.hero'),enemy=root.querySelector('.enemy');
   const outfit={JB00:'traveler',JB01:'warrior',JB02:'mage',JB03:'bard'}[context.after.hero.job.id]||'traveler';
   const pose=(actor,key)=>{if(actor)setArt(actor,key)};
   const animate=(actor,frames,duration)=>{if(actor?.animate&&duration)context.animations.push(actor.animate(frames,{duration,easing:'ease-in-out'}))};
   const anchor=actor=>{const value=actor&&globalThis.getComputedStyle?.(actor).transform;return value&&value!=='none'?value:''};
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
   if(p.stage==='battle.hero.hit'){pose(hero,`hero-${outfit}-${p.hit.amount>0?'hit':'guard'}`);context.status.textContent=effectText(p.hit,localizedContent(content,locale()))}
   if(p.stage==='battle.result')context.status.textContent=context.notice;
   return;
  }
  const position=p.stage==='walk'?p.to:p.stage==='trail'?p.pos:['arrival','inn.stop','move.fade'].includes(p.stage)?p.to:null;
  if(Number.isInteger(position)){
   for(const marker of context.path?.children||[]){const current=Number(marker.dataset.pos)===position;marker.removeAttribute('aria-current');if(current)marker.setAttribute('aria-current','step');marker.style.background=current?'#f4b942':Number(marker.dataset.pos)<position?'#d5e4ba':'transparent'}
   context.status.textContent=`${position} / 100`;
  }
  if(p.stage==='preview')context.status.textContent=`${context.after.pos} → ${p.preview.to??context.after.pos}`;
  if(p.stage==='inn.stop')context.status.textContent=`${p.to} / 100 · ${context.after.board?.currentName||''}`;

  if(p.stage==='dice.roll'||p.stage==='dice.lock')stage?.update({band:context.after.board?.band?.id||1,die:p.die},p.stage==='dice.roll'&&p.motion!=='fade');
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
  
  const current=presentationCurrent(context);presentationContext=null;releasePresentation(context);
  if(reason==='cancel'||!current)return;
  // A visual-only battle already handed its effects to the existing audio path.
  // Final render invalidates pending unlock work: renew only an unplayed batch,
  // never an already delivered/failed batch. Navigation cancellation returns above.
  const renewBattleSound=context.audio&&context.battleVisual&&pendingCommittedSound!==null;
  lastAction='';notice=context.notice;render();
  if(renewBattleSound)scheduleCommittedSound(context.effects,`${context.after.runId}:${context.after.revision}`,context.after.runId,context.after.revision);
  if(reason==='skip'&&context.audio){const generation=skipSoundGeneration;for(const step of sounds){const id=setTimeout(()=>{skipSoundTimers.delete(id);if(generation===skipSoundGeneration&&presentationCurrent(context)&&!session.meta.settings?.mute)try{sound.play(step.payload.cue)}catch{}},step.atMs);skipSoundTimers.add(id)}}
  if(context.audio&&!context.battleVisual&&reason!=='skip')scheduleCommittedSound(context.effects.filter(f=>!['dieRolled','moved','levelUp','innArrived'].includes(f.t)),`${context.after.runId}:${context.after.revision}`,context.after.runId,context.after.revision);
 }
});
function cancelPresentation(){skipSoundGeneration++;for(const id of skipSoundTimers)clearTimeout(id);skipSoundTimers.clear();presentation.cancel();if(presentationContext){const context=presentationContext;presentationContext=null;releasePresentation(context)}}
function playCommittedPresentation(before,after,effects,audio){
 if(screen!=='game'||document.hidden||session?.run?.runId!==after.runId||session?.run?.revision!==after.revision)return false;
 // Castle audio fade and regional transition are not supported by this app-only slice.
 if(effects.some(f=>f.t==='moved'&&f.stop==='castle')||before.board?.band?.id!==after.board?.band?.id)return false;
 const plan=planPresentation({before,after,effects,battleVisual:true,settings:{...session.meta.settings,reducedMotion:reduced.matches||session.meta.settings?.reducedMotion}});
 if(!plan.steps.length)return false;
 const resultNotice=notice;lastAction='';notice='';render(before);
 const context={after,effects,audio,battleVisual:plan.steps.some(s=>s.kind==='display'&&s.payload.stage.startsWith('battle.')),notice:resultNotice,controls:[...root.querySelectorAll('.actions input,.actions select,.actions button')].map(control=>[control,control.disabled]),animations:[]};
 for(const [control] of context.controls)control.disabled=true;
 const status=el('p','presentation-status',`${before.pos} / 100`);status.dataset.presentationStatus='';status.setAttribute('role','status');root.append(status);context.status=status;
 const moved=effects.find(f=>f.t==='moved');
 if(moved){const path=el('ol','presentation-path');path.dataset.presentationPath='';path.style.display='flex';path.style.gap='0.5rem';path.style.listStyle='none';
  for(let pos=moved.from;pos<=moved.to;pos++){const marker=el('li','',String(pos));marker.dataset.pos=String(pos);marker.style.padding='0.4rem';marker.style.border='1px solid currentColor';if(pos===moved.from)marker.setAttribute('aria-current','step');path.append(marker)}root.append(path);context.path=path;
 }

 const skip=el('button','quiet',actionLabel({type:'skip'}));skip.type='button';skip.addEventListener('click',()=>presentation.skip());root.append(skip);context.skip=skip;
 presentationContext=context;stage?.update({band:before.board?.band?.id||1,die:before.rolled?.die},false);presentation.play(plan);if(context.audio&&context.battleVisual)scheduleCommittedSound(effects,`${after.runId}:${after.revision}`,after.runId,after.revision);return true;
}
// END committed presentation bridge
function paragraph(text,cls=''){return el('p',cls,text)}
function heading(text){return el('h2','',text)}
let cachedDisplayContent,cachedDisplayLocale;
function uiContent(){const lang=locale();if(!cachedDisplayContent||cachedDisplayLocale!==lang){cachedDisplayContent=localizedContent(content,lang);cachedDisplayLocale=lang}return cachedDisplayContent}
function locale(){return resolveLocale(session?.meta?.settings?.language,navigator.languages||[navigator.language])}
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
 for(const [i,c] of (v?.hero.companions||[]).entries()){const comp=art('comp-'+c.role,'idle','companion');const cp=project(-3.25-i*.85,.2,1.0+i*.5);comp.style.left=cp.x+'%';comp.style.top=cp.y+'%';comp.title=c.name;wrap.append(comp)}
 if(v?.battle){const b=v.battle,kind=b.telegraph.kind;const pose=/big|大/.test(kind)?'big':/guard|守/.test(kind)?'guard':/open|隙/.test(kind)?'open':'attack';const id=b.enemy.id.toLowerCase();const en=art(id,id==='dk01'?`p${b.phase.index>0?2:1}-${pose}`:pose,'enemy');const p=project(2,.1,.3);en.style.left=p.x+'%';en.style.top=p.y+'%';wrap.append(en);}
 if(v?.rolled)wrap.append(el('strong','die-value',msg("ui.app.scene.f51ade3b85",{p0:(v.rolled.die)})));
 const ribbon=el('div','scene-ribbon',home?msg("ui.app.scene.term.828b8feda9"):v?.board.band?.name);wrap.append(ribbon);
 const currentStage=createStage(canvas,(status)=>{if(status==='restored'){wrap.classList.remove('no-3d');wrap.querySelector('.render-warning')?.remove();return}wrap.classList.add('no-3d');if(!wrap.querySelector('.render-warning'))wrap.append(paragraph(msg("ui.app.scene.literal.7baa586810"),'render-warning'))});
 stage=currentStage;requestAnimationFrame(()=>{if(stage===currentStage&&!presentation.running)currentStage.update({band:v?.board.band?.id||1,die:v?.rolled?.die},lastAction==='roll'&&animated())});return wrap;
}
function render(presentationView=null){
 cancelPresentation();
 invalidateCommittedSound();
 setMessageLocale(locale());document.documentElement.lang=locale();
 const hadFocus=root.contains(document.activeElement);if(hadFocus)requestAnimationFrame(()=>{const focus=root.querySelector('.notice')||root.querySelector('h1')||root.querySelector('button');if(focus){focus.tabIndex=-1;focus.focus({preventScroll:true})}});stage?.dispose();clearTimeout(timer);root.replaceChildren();root.dataset.motion=animated()?'full':'reduced';
 const header=el('header','masthead');add(header,button(msg("ui.app.render.literal.624fe166e6"),()=>{screen='home';lastAction='';render()},'brand'),button(tr('ui.settings'),settings,'quiet'));root.append(header);if(locale()!=='ja')root.append(paragraph(tr('ui.translationPending'),'translation-notice'));
 if(error){const box=el('section','error');box.setAttribute('role','alert');add(box,heading(msg("ui.app.render.literal.c1fa727cb7")),paragraph(error),button(msg("ui.app.render.literal.bb1f5b26d4"),async()=>{try{await session.load();error='';lastAction='';render()}catch(e){showError(e)}}));root.append(box)}
 sound.configure(session?.meta?.settings);sound.scene(screen==='home'||document.hidden?null:presentationView||session?.view);
 if(!session){root.append(paragraph(msg("ui.app.render.literal.f1c2c7d3df")));return}
 if(screen==='home'){home();return}
 const v=localizedView(presentationView||session.view,content,locale());if(!v){screen='home';home();return}
 const title=el('div','chapter');add(title,el('span','eyebrow',`${v.route.id} / ${v.route.name}`),el('h1','',`${v.pos} / 100`),el('span','roll-count',msg("ui.app.render.bdfdbc6d58",{p0:(v.rolls)})));root.append(title);
 const stats=el('section','stats');stats.setAttribute('aria-label',msg("ui.app.render.literal.998f75677a"));add(stats,stat(msg("ui.app.render.term.d6d2aa99fd"),v.hero.hp,v.hero.maxHp,'hp'),stat(msg("ui.app.render.term.522148a1fd"),v.hero.mp,v.hero.maxMp,'mp'),el('strong','gold',`${v.hero.gold} G`),el('span','level',`Lv.${v.hero.level} ${v.hero.job.name}`));root.append(stats);root.append(add(el('div','map-strip'),paragraph(msg("ui.app.render.7dcec7dac2",{p0:(v.board.nextStop===100?msg("ui.app.render.term.a4c5f93082"):msg("ui.app.render.term.6038669e41")),p1:(v.board.distanceToNextStop)})),button(msg("ui.app.render.literal.b6e1addfac"),()=>worldMap(v),'quiet')));
 root.append(paragraph(msg("ui.app.render.f65841c006",{p0:(v.pos),p1:(v.board.currentName)}),'muted'));root.append(scene(v));
 if(v.battle){const t=el('section','telegraph');add(t,el('span','eyebrow',msg("ui.app.render.literal.cd7539d915")),heading(`${v.battle.enemy.name} · ${v.battle.enemy.hp}/${v.battle.enemy.maxHp}`),paragraph(telegraphText(v.battle.telegraph)),paragraph(v.battle.telegraph.tell,'muted'));root.append(t)}
 if(v.battle?.temporaryStatuses?.length){const box=el('section','story');box.append(heading(msg("ui.app.render.literal.78ea180ba1")));for(const st of v.battle.temporaryStatuses)box.append(paragraph(msg("ui.app.render.f1030d5885",{p0:(st.label),p1:(st.kinds.map(k=>({attackDown:msg("ui.app.render.term.bb59eb7119"),defenseDown:msg("ui.app.render.term.862a6a31e3"),turnEndHpLoss:msg("ui.app.render.term.082937427d")}[k]||k)).join(msg("ui.app.render.term.2a21905f43"))),p2:(st.amount),p3:(st.remainingTurns)})));root.append(box)}
 if(v.battle?.forecast?.unguarded.length){const box=el('section','story');box.append(heading(msg("ui.app.render.literal.34675f17d7")),paragraph(msg("ui.app.render.literal.87577bfcf3")));for(const [k,name]of [['unguarded',msg("ui.app.render.term.2e483eb82e")],['guarded',msg("ui.app.render.term.1177af8a7d")]])for(const f of v.battle.forecast[k])box.append(paragraph(msg("ui.app.render.75ca5568df",{p0:(f.round),p1:(f.name),p2:(name),p3:(f.damage)})));root.append(box)}
 if(v.battle?.history.length){const history=el('details','battle-history');history.append(el('summary','',msg("ui.app.render.literal.518564feda")));for(const r of v.battle.history)history.append(paragraph(msg("ui.app.render.bc7ba68654",{p0:(r.round),p1:(r.dealt),p2:(r.hpLost),p3:(r.enemy)})));root.append(history)}
 const n=el('section','notice');n.setAttribute('role','status');n.setAttribute('aria-live','polite');add(n,paragraph(notice||(!presentationView&&savedResult())||msg("ui.app.render.term.1e05a3a6d6")),el('small','',msg("ui.app.render.2c8ca60f57",{p0:(v.revision)})));root.append(n);
 if(v.event){const e=el('section','story');add(e,el('span','eyebrow',v.event.kind),heading(v.event.name),paragraph(v.event.scene));if(v.event.unscripted)add(e,paragraph(msg("ui.app.render.literal.c08e3524c9"),'warning'));if(v.event.puzzle)e.append(puzzlePanel(v.event.puzzle));root.append(e)}
 if(v.prompt?.title)root.append(heading(v.prompt.title));
 if(v.reward){const p=el('section','story');add(p,heading(msg("ui.app.render.literal.def16f80b1")),paragraph(msg("ui.app.render.ad5147affc",{p0:(v.reward.gold),p1:(v.reward.xp)})),paragraph([v.reward.gear.name,v.reward.item.name].filter(Boolean).join(msg("ui.app.render.term.2a21905f43"))));root.append(p)}
 if(v.phase==='gate')root.append(add(el('section','story'),heading(msg("ui.app.render.literal.726055e48f")),paragraph(msg("ui.app.render.literal.e485399357"))));
 if(v.phase==='retryOffer')root.append(add(el('section','story'),heading(msg("ui.app.render.literal.3f905081bb")),paragraph(msg("ui.app.render.literal.3a301ecd5f"))));
 if(v.phase==='finished'){const r=el('section','story result');add(r,el('span','eyebrow',msg("ui.app.render.literal.5308c10dab")),heading(v.result?.defeated?msg("ui.app.render.term.52203486d8"):msg("ui.app.render.term.17bd5d6c12")),paragraph(msg("ui.app.render.7c9988bef2",{p0:(v.route.name),p1:(v.furthest),p2:(v.rolls)})),paragraph(msg("ui.app.render.40d7f7fcb6",{p0:(v.hero.job.name),p1:(v.hero.companions.map(c=>c.name).join(msg("ui.app.render.term.2a21905f43"))||msg("ui.app.render.term.6217280784"))})),button(msg("ui.app.render.literal.e5ed7aa5db"),()=>{screen='home';render()}));r.append(button(tr('ui.share'),()=>sharePanel(v),'share-x'));root.append(r)}
 if(v.phase==='board'||v.phase==='rolled'){const trail=el('ol','trail');for(const sq of v.board.next6){const li=el('li');add(li,el('b','',sq.pos),el('span','',sq.kind));trail.append(li)}root.append(trail)}
 const nav=el('nav','tabs');for(const [id,name] of [['main',msg("ui.app.render.term.b396c18ea5")],['items',msg("ui.app.render.term.0ad8cdd51e")],['gear',msg("ui.app.render.term.b5989f74c7")],['party',msg("ui.app.render.term.86e8df92c1")]])nav.append(button(name,()=>{tab=id;render()},tab===id?'selected':''));root.append(nav);
 const body=el('section','actions');body.setAttribute('aria-label',tab==='main'?msg("ui.app.render.term.f8f6a2fe31"):msg("ui.app.render.term.93a200dea7"));
 if(tab==='items')add(body,heading(msg("ui.app.render.8b25e3dabf",{p0:(v.hero.bag.items.length),p1:(v.hero.bag.capacity)})),...v.hero.bag.items.map(it=>paragraph(msg("ui.app.render.c938ee4c06",{p0:(it.name),p1:(it.category),p2:(it.timing),p3:(it.limit||msg("ui.app.render.term.23480562a4")),p4:(it.effect)}),'comparison-copy')));
 if(tab==='gear'){
  add(body,heading(msg("ui.app.render.literal.1ae67cfcaf")),paragraph(msg("ui.app.render.66bc9851e6",{p0:(v.hero.attack),p1:(v.hero.defense)})),...v.hero.gear.map(g=>paragraph(msg("ui.app.render.0c81238d33",{p0:(g.equipped?msg("ui.app.render.term.bf2bbcdd02"):''),p1:(g.name),p2:(g.baseStat),p3:(g.timing||uiContent().gear[g.id]?.timing||''),p4:(g.effect||''),p5:(g.diff?msg("ui.app.module.9876c43d0b",{p0:(JSON.stringify(g.diff))}):'')}))));
 }
 if(tab==='party')add(body,heading(msg("ui.app.render.literal.f544044d74")),...v.hero.companions.map(x=>paragraph(companionSummary(x),'comparison-copy')),!v.hero.companions.length?paragraph(msg("ui.app.render.literal.cd1c50af42")):null);
 if(tab==='party'&&v.inn?.tavern){add(body,heading(msg("ui.app.render.literal.1ae4f6667f")),paragraph(msg("ui.app.render.literal.d27f9b9772")));for(const candidate of v.inn.tavern.candidates)body.append(add(el('article','candidate'),portrait(candidate,''),paragraph(companionSummary(candidate),'comparison-copy')))}
 for(const a of v.actions){const group=['useItem','item','bagSwap','bagDecline','pickBagItem','sellItem'].includes(a.type)?'items':['equip','setSpells','sellGear'].includes(a.type)?'gear':['recruit'].includes(a.type)?'party':'main';if(group!==tab||a.type==='changeJob')continue;body.append(actionForm(a,v))}
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
function worldMap(v){sound.play('map.open');const d=modal(msg("ui.app.worldMap.term.b6e1addfac"));add(d,paragraph(msg("ui.app.worldMap.250a2572a7",{p0:(v.route.name),p1:(v.pos),p2:(v.board.band.name)})));const grid=el('ol','world-map');for(const tile of mapTiles(v)){const li=el('li',(tile.current?'current ':tile.visited?'visited ':'')+(tile.inn?'inn':''));li.setAttribute('aria-label',tile.label+(tile.current?msg("ui.app.worldMap.term.c4fd09e10a"):''));li.title=tile.name;add(li,el('b','',tile.pos),tile.inn?el('small','',msg("ui.app.worldMap.literal.34eb96f43d")):tile.pos===100?el('small','',msg("ui.app.worldMap.literal.76f47004cc")):null);grid.append(li)}add(d,grid,paragraph(msg("ui.app.worldMap.literal.7d01e2c98c")));}
function jobs(v){const d=modal(msg("ui.app.jobs.term.a9e0b26002"));add(d,paragraph(msg("ui.app.jobs.83411198f0",{p0:(v.hero.job.name)})));const preview=el('div','job-preview');d.append(preview);function choose(id){sound.play('try.on');const job=uiContent().jobs[id],img=art('hero-'+({JB00:'traveler',JB01:'warrior',JB02:'mage',JB03:'bard'}[id]));img.className='try-on';preview.replaceChildren(img,heading(job.name),paragraph(job.text),actionForm(v.actions.find(a=>a.type==='changeJob'&&a.jobId===id),v));}for(const j of v.inn.jobs)d.append(button(msg("ui.app.choose.4363446e2e",{p0:(j.name)}),()=>choose(j.id),'quiet'));d.append(button(msg("ui.app.choose.literal.8a4ba79f47"),()=>d.close(),'quiet'));choose(v.hero.job.id);}
function help(){const d=modal(msg("ui.app.help.term.16679487f2"));add(d,paragraph(msg("ui.app.help.literal.dd817f4395")),paragraph(msg("ui.app.help.literal.298c2d3866")),paragraph(msg("ui.app.help.literal.9bb2c9eceb")),paragraph(msg("ui.app.help.literal.4661ec53d0")));}
function modal(title){sound.menu(true);const d=el('dialog');const h=heading(title);h.id='dialog-'+crypto.randomUUID();d.setAttribute('aria-labelledby',h.id);add(d,h);root.append(d);const close=button(msg("ui.app.modal.literal.f6c244f988"),()=>d.close(),'quiet');d.append(close);d.addEventListener('close',()=>{sound.menu(session?.view?.phase==='inn');sound.play('ui.cancel');d.remove()});d.showModal();return d}
function confirmStart(route){if(session.run||session.status==='unsupported'){const d=modal(msg("ui.app.confirmStart.term.f60f49b1c2"));add(d,paragraph(msg("ui.app.confirmStart.3b2526dd1a",{p0:(session.run?session.run.pos+msg('ui.app.confirmStart.runSuffix'):msg("ui.app.confirmStart.term.3eac9e4bd4")),p1:(uiContent().routes[route].name)})),button(msg("ui.app.confirmStart.literal.7f915bacbc"),()=>{d.close();start(route,true)},'primary'));}else start(route,false)}
async function start(route,confirmed){try{const soundGeneration=committedSoundGeneration;prepareCommittedSound();await session.start(route,confirmed);const allowCommittedSound=soundGeneration===committedSoundGeneration,runId=session.run.runId,revision=session.run.revision;screen='game';tab='main';notice=msg("ui.app.start.term.ed4b98dc3e");lastAction='';render();if(allowCommittedSound)scheduleCommittedSound([],`${runId}:${revision}`,runId,revision,'depart')}catch(e){showError(e)}}
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
 add(form,b);if(!a.enabled)form.append(paragraph(a.reasonText||({same:msg("ui.app.field.term.2ba9627cc7"),equipped:msg("ui.app.field.term.5a430d6bb0"),recruitUsed:msg("ui.app.field.term.eaa4774367")}[a.reason]||msg("ui.app.field.term.96105c98cf")),'reason'));
 if(a.preview&&a.type==='rest')form.append(paragraph(msg("ui.app.field.a7d2446f4f",{p0:(a.preview.hp>=0?'+':''),p1:(a.preview.hp),p2:(a.preview.mp>=0?'+':''),p3:(a.preview.mp),p4:(a.preview.gold>=0?'+':''),p5:(a.preview.gold)}),'muted'));
 if(a.preview?.discarded)form.append(paragraph(msg("ui.app.field.f4d7448414",{p0:(a.preview.discarded)}),'muted'));
 if(a.afterGold!==undefined)form.append(paragraph(msg("ui.app.field.f51588c994",{p0:(a.afterGold),p1:(a.shortfall?msg("ui.app.module.372ed15a46",{p0:(a.shortfall)}):'')}),'muted'));
 if(a.diff)form.append(paragraph(msg("ui.app.field.f0660cb661",{p0:(a.diff.before),p1:(a.diff.after),p2:(a.diff.delta>=0?'+':''),p3:(a.diff.delta)}),'muted'));
 if(a.type==='pickChest'){const c=v.chest.candidates.find(c=>c.index===a.index);form.append(paragraph(`${c?.name||''}：${c?.effect||c?.text||''}`))}
 form.addEventListener('submit',async e=>{e.preventDefault();if(session.busy||presentation.running||b.disabled)return;try{const action={...a};if(a.needsTargets){action.targets=targetChecks.filter(t=>t.input.checked).map(t=>t.index);if(!action.targets.length)throw Error(msg("ui.app.field.literal.89a49ca24d"))}for(const f of fields){if(f.key.startsWith('aid.')&&fields.find(x=>x.key==='actionAid')?.input.value!==f.key.split('.')[1])continue;if(f.spec.optional&&!f.input.value.trim())continue;const val=parseInput(f.spec,f.input.value);if(f.key.startsWith('aid.'))action.params={...action.params,[f.key.split('.')[2]]:val};else if(f.key.startsWith('params.'))action.params={...action.params,[f.key.slice(7)]:val};else action[f.key]=val}if(action.actionAid&&action.actionAid!=='なし')action.itemId=action.actionAid;delete action.actionAid;if(a.type==='setSpells'){action.ids=spellChecks.filter(s=>s.input.checked).map(s=>s.id);if(action.ids.length>v.hero.spells.slots)throw Error(msg("ui.app.field.38b970aa00",{p0:(v.hero.spells.slots)}))}b.disabled=true;const soundGeneration=committedSoundGeneration;prepareCommittedSound();const before=structuredClone(session.view);const fx=await session.act(action);const after=structuredClone(session.view);const allowCommittedSound=soundGeneration===committedSoundGeneration;const effectRunId=session.run.runId,effectRevision=session.run.revision;lastAction=fx.length?a.type:'';notice=fx.map(f=>effectText(f,localizedContent(content,locale()))).filter(Boolean).join(' · ')||msg("ui.app.field.term.a517fdcb64");error='';if(allowCommittedSound&&playCommittedPresentation(before,after,fx,allowCommittedSound))return;render();if(allowCommittedSound)scheduleCommittedSound(fx,`${effectRunId}:${effectRevision}`,effectRunId,effectRevision);}catch(err){showError(err)}});return form;
}
function savedResult(){const r=session.meta.uiLastResult;return r&&r.runId===session.run?.runId&&r.revision===session.run?.revision?r.effects.map(f=>effectText(f,localizedContent(content,locale()))).filter(Boolean).join(' · '):''}
function reveals(v){const panel=el('details','story');panel.append(el('summary','',msg("ui.app.reveals.literal.1f0b8387d4")));for(const rec of v.reveals){const d=rec.data||{};panel.append(paragraph(msg("ui.app.reveals.2ecfe17754",{p0:(rec.turn)}),'eyebrow'));if(rec.kind==='ownedSwordComparison'||rec.kind==='ownedArmorComparison'){panel.append(paragraph(msg("ui.app.reveals.literal.89c2708c66")));const checks=[];for(const sword of d.swords||d.armor){const box=el('input');box.type='checkbox';const label=add(el('label','check'),box,el('span','comparison-copy',comparisonText(sword)));checks.push(box);box.onchange=()=>{if(checks.filter(x=>x.checked).length>2)box.checked=false};panel.append(label)}}else if(d.text){panel.append(paragraph(d.text))}else if('count' in d){panel.append(paragraph(msg("ui.app.reveals.242ff05421",{p0:(d.count)})));for(const sq of d.squares||[])panel.append(paragraph(msg("ui.app.reveals.8d3671ff6e",{p0:(sq.pos),p1:(sq.name)})))}else if('square' in d){if(d.enemyName)panel.append(paragraph(d.enemyName));if(d.firstAction)panel.append(paragraph(`${d.firstAction.name}：${d.firstAction.tell||''}`));if(d.reward)panel.append(paragraph(msg("ui.app.reveals.564d3fc158",{p0:(d.reward.gold),p1:(d.reward.xp)})));for(const candidate of d.candidates||[])panel.append(paragraph(candidate.name));for(const option of d.options||[])panel.append(previewResult(option));panel.append(paragraph(d.square?msg("ui.app.reveals.678663b34e",{p0:(d.square.pos),p1:(d.square.kind),p2:(d.square.name)}):msg("ui.app.reveals.term.5349965875")))}else if(d.outcomes){d.outcomes.forEach(x=>panel.append(paragraph(msg("ui.app.reveals.2c7aa1a6cb",{p0:(x.die),p1:(x.to),p2:(x.kind)}))))}else if(d.name){panel.append(paragraph(`${d.name}：${d.tell||''}`))}else{const rows=d.squares||d.battles||d.traps||[];if(!rows.length)panel.append(paragraph(msg("ui.app.reveals.literal.f2c0caf487")));for(const x of rows){panel.append(paragraph(msg("ui.app.reveals.a31812f03c",{p0:(x.pos),p1:(x.enemyName||x.name),p2:(x.kind)})));for(const a of x.firstActions||[])panel.append(paragraph(`${a.name}：${a.tell}`));for(const o of x.options||[])panel.append(paragraph(o.label))}}}return panel}
function audioSettings(d,settings){const group=el('div');const mute=el('input');mute.type='checkbox';mute.name='mute';mute.checked=!!settings.mute;group.append(add(el('label','check'),mute,el('span','',msg("ui.app.audioSettings.literal.0500c422a8"))));for(const [key,label,value] of [['masterVolume',msg("ui.app.audioSettings.term.982348c769"),.8],['bgmVolume',msg("ui.app.audioSettings.term.dd5f9601f1"),.5],['seVolume',msg("ui.app.audioSettings.term.edcfda31c2"),.8]]){const input=el('input');input.type='range';input.min=0;input.max=1;input.step=.05;input.name=key;input.value=settings[key]??value;group.append(add(el('label','input-row'),el('span','',label),input))}return group}
function settings(){const wasPresenting=presentation.running;cancelPresentation();if(wasPresenting)render();const d=modal(msg("ui.app.settings.term.49b0ac0f54"));const settings=session?.meta?.settings||{};const close=d.querySelector('button');let pending=false;const language=el('select');LOCALES.forEach((code,i)=>{const o=el('option','',LOCALE_NAMES[i]);o.value=code;language.append(o)});language.value=locale();d.append(add(el('label','input-row'),el('span','',tr('ui.language')),language));const coverage=missingMessages(language.value);d.append(paragraph(msg('ui.app.settings.coverage',{p0:coverage.translated,p1:coverage.total}),'muted'));const select=el('select');for(const [v,t] of [['standard',msg("ui.app.settings.term.8320984b0b")],['short',msg("ui.app.settings.term.6e7fdac4f9")]]){const o=el('option','',t);o.value=v;select.append(o)}select.value=settings.animation||'standard';const label=el('label','input-row',msg("ui.app.settings.literal.909c6a9dea"));label.append(select);const reducedCheck=el('input');reducedCheck.type='checkbox';reducedCheck.checked=!!settings.reducedMotion;add(d,label,add(el('label','check'),reducedCheck,el('span','',msg("ui.app.settings.literal.08b0f55b18"))),audioSettings(d,settings),paragraph(msg("ui.app.settings.literal.8b3a5cfc45"),'muted'),button(msg("ui.app.settings.literal.0d19921a25"),()=>{sound.play('shield');sound.play('bell',.6)}),button(msg("ui.app.settings.literal.b4fd2d361a"),async()=>{
 if(pending||session.busy||!d.open||!d.isConnected)return;
 pending=true;
 try{
  const snapshot=Object.freeze({language:language.value,animation:select.value,reducedMotion:reducedCheck.checked,mute:d.querySelector('[name=mute]').checked,masterVolume:Number(d.querySelector('[name=masterVolume]').value),bgmVolume:Number(d.querySelector('[name=bgmVolume]').value),seVolume:Number(d.querySelector('[name=seVolume]').value)});
  for(const control of d.querySelectorAll('input,select,button'))if(control!==close)control.disabled=true;
  await session.settings(snapshot);
  await loadMessages(snapshot.language);
  if(!d.open||!d.isConnected)return;
  d.close();render();
 }catch(e){
  if(!d.open||!d.isConnected)return;
  d.close();showError(e);
 }finally{pending=false}
}));}
function records(){const d=modal(msg("ui.app.records.term.9200344787"));add(d,heading(msg("ui.app.records.literal.2283159eea")));for(const [route,b] of Object.entries(session.meta.bests))add(d,paragraph(msg("ui.app.records.bf06ba048e",{p0:(route==='all'?msg("ui.app.records.term.23dad3af9c"):uiContent().routes[route]?.name||route),p1:(b.furthest),p2:(b.rolls),p3:(b.defeated?msg("ui.app.records.term.327f2f0129"):'')})));for(const [kind,title,defs] of [['enemies',msg("ui.app.records.term.0361316afc"),uiContent().enemies],['companions',msg("ui.app.records.term.294293277d"),uiContent().companions],['gear',msg("ui.app.records.term.2987781405"),uiContent().gear]])add(d,heading(title),paragraph(session.meta.dex[kind].map(id=>defs[id]?.name||id).join(msg("ui.app.records.term.2a21905f43"))||msg("ui.app.records.term.c2c66b3886")));}
try{content=await loadContentInBrowser('./');session=createSession(content,createIndexedDbStore({name:'yusha100-publication-preview-v1'}));await session.load();await loadMessages(locale());render()}catch(e){root.replaceChildren(heading(msg("ui.app.records.literal.46dff6e77f")),paragraph(msg("ui.app.records.literal.de1412f35a")),paragraph(e.message,'error'))}
document.addEventListener('visibilitychange',()=>{if(document.hidden){const wasPresenting=presentation.running;cancelPresentation();if(wasPresenting)render();invalidateCommittedSound();lastAction='';clearTimeout(timer)}});

function puzzlePanel(p){const box=el('div','puzzle-display');if(p.prompt)box.append(paragraph(p.prompt));for(const [key,value] of Object.entries(p.display||{})){if(Array.isArray(value)&&value.every(Array.isArray)){box.append(heading(key==='reference'?msg("ui.app.puzzlePanel.term.24ab53a2bb"):msg("ui.app.puzzlePanel.term.c820c1e60f")));const grid=el('div','puzzle-grid');for(const row of value)for(const lit of row)grid.append(el('span',lit?'lit':'dark',lit?msg("ui.app.puzzlePanel.term.73b972d71b"):msg("ui.app.puzzlePanel.term.140ede2642")));box.append(grid)}else box.append(paragraph(msg("ui.app.puzzlePanel.425f470c0b",{p0:({cupCount:msg("ui.app.puzzlePanel.term.3d191b6233"),unit:msg("ui.app.puzzlePanel.term.c2c1bfe05a"),scaleMax:msg("ui.app.puzzlePanel.term.118b3ffebc")}[key]||key),p1:(value)})))}for(const [id,label] of Object.entries(p.labels||{}))box.append(paragraph(label,'muted'));for(const hint of p.hints||[])box.append(paragraph(typeof hint==='string'?hint:puzzleHintText(hint,p.labels)));if(p.eliminated?.length)box.append(paragraph(msg("ui.app.puzzlePanel.literal.2bd7c73f69")+p.eliminated.map(x=>p.labels[x]||x).join('、')));if(p.fixedPrefix?.length)box.append(paragraph(msg("ui.app.puzzlePanel.literal.073be543a8")+p.fixedPrefix.map(x=>p.labels[x]||x).join(' → ')));if(Object.keys(p.fixedPairs||{}).length)box.append(paragraph(msg("ui.app.puzzlePanel.literal.b3ee49dd39")+Object.entries(p.fixedPairs).map(([a,b])=>`${p.labels[a]||a} → ${p.labels[b]||b}`).join('、')));if(p.pendingWrong)box.append(paragraph(msg("ui.app.puzzlePanel.literal.c32448f77b")));return box}

function inputLabel(id){return {statusId:msg("ui.app.inputLabel.term.c39536b5d4"),attackId:msg("ui.app.inputLabel.term.2946d1a6e3"),defenseId:msg("ui.app.inputLabel.term.72c18b8836"),declaration:msg("ui.app.inputLabel.term.e8a5a465a6"),which:msg("ui.app.inputLabel.term.a7ee428ae7"),hpRooms:msg("ui.app.inputLabel.term.c8c4cefc60"),partner:msg("ui.app.inputLabel.term.a2e319e114"),pos:msg("ui.app.inputLabel.term.300439317c"),kind:msg("ui.app.inputLabel.term.9596ee6f51"),substituteId:msg("ui.app.inputLabel.term.15971d7654"),groups:msg("ui.app.inputLabel.term.bad37f8166"),mp:msg("ui.app.inputLabel.term.3b81999de7"),stat:msg("ui.app.inputLabel.term.a7ee428ae7"),answer:msg("ui.app.inputLabel.term.c83db6da15"),values:msg("ui.app.inputLabel.term.fcff419205"),newItemId:msg("ui.app.inputLabel.term.cc19e2407a"),itemId:msg("ui.app.inputLabel.term.02b85d978f"),target:msg("ui.app.inputLabel.term.2882b00920"),order:msg("ui.app.inputLabel.term.8de09130b2"),amount:msg("ui.app.inputLabel.term.7a961d6b2d"),index:msg("ui.app.inputLabel.term.7920e38dd6"),die:msg("ui.app.inputLabel.term.26146f5dc5")}[id]||msg("ui.app.inputLabel.term.0cdffca379")}

function previewResult(o){const box=el('div','preview-result');if(o.label)box.append(heading(o.label));if(o.die!==undefined)box.append(paragraph(msg("ui.app.previewResult.f9cf40edb7",{p0:(o.die)})));if(o.input!==undefined)box.append(paragraph(msg("ui.app.previewResult.537a8bb364",{p0:(o.input)})));if(o.enabled===false)box.append(paragraph(msg("ui.app.previewResult.literal.1167aecc2e")));else if(o.hp!==undefined)box.append(paragraph(msg("ui.app.previewResult.731021acf4",{p0:(o.hp>=0?'+':''),p1:(o.hp),p2:(o.mp>=0?'+':''),p3:(o.mp),p4:(o.gold>=0?'+':''),p5:(o.gold)})));for(const row of [...(o.variants||[]),...(o.choices||[]),...(o.outcomes||[])])box.append(previewResult(row));if(o.pending)box.append(paragraph(msg("ui.app.previewResult.literal.1ac10759b5")));return box}

function sharePanel(v=null){const draft=shareDraft({locale:locale(),url:CANONICAL_URL,result:v?{pos:v.furthest,rolls:v.rolls,defeated:!!v.result?.defeated}:null});const d=modal(tr('ui.shareDraft'));const text=el('textarea');text.value=draft.text;text.readOnly=true;text.setAttribute('aria-label',tr('ui.shareDraft'));d.append(text);d.append(paragraph(draft.ready?msg('ui.app.sharePanel.localOnly'):tr('ui.urlPending')));const copy=button(tr('ui.copy'),async()=>{try{await navigator.clipboard.writeText(draft.text);copy.textContent=msg('ui.app.sharePanel.copied')}catch{copy.textContent=msg('ui.app.sharePanel.copyUnavailable')}});copy.disabled=!draft.ready;d.append(copy);}

function rankingPreview(){const d=modal(msg('ui.ranking.title'));d.append(paragraph(msg('ui.ranking.disclaimer')));d.append(paragraph(msg('ui.ranking.condition')));const name=el('input');name.maxLength=40;name.autocomplete='off';const note=paragraph('');d.append(add(el('label','input-row'),el('span','',msg('ui.ranking.name')),name));d.append(button(msg('ui.ranking.freeze'),()=>{const preview=namePreview(name.value);note.textContent=preview.eligible?msg('ui.ranking.named',{p0:preview.name}):msg('ui.ranking.anonymous')}));d.append(note);const board=createLocalBoard(),area=el('section');area.setAttribute('aria-live','polite');d.append(area);function draw(){const state=board.state;area.replaceChildren();if(state.status==='loading')area.append(paragraph(msg('ui.ranking.loading')));if(state.status==='empty')area.append(paragraph(msg('ui.ranking.empty')));if(state.status==='error')area.append(paragraph(msg('ui.ranking.error')));for(const row of state.rows)area.append(paragraph(msg('ui.ranking.row',{p0:row.rank,p1:row.ticket.name,p2:row.result.furthest,p3:row.result.rolls})));}async function reload(){const p=board.load('unconfigured-local-preview');draw();await p;draw()}d.append(button(msg('ui.ranking.retry'),reload));reload();}

