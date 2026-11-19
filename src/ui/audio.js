import {SFX} from './audio-recipes.js';
// Locally synthesized original score from art-direction §7.5. No downloads.
export function frequency(note){const m=/^([A-G])([b#]?)(\d)$/.exec(note);if(!m)return 0;const n={C:0,D:2,E:4,F:5,G:7,A:9,B:11}[m[1]]+(m[2]==='#'?1:m[2]==='b'?-1:0)+(Number(m[3])+1)*12;return 440*2**((n-69)/12)}
export function effectCues(effects,key,seen){const out=[];effects.forEach((f,i)=>{const id=`${key}:${i}`;if(seen.has(id))return;seen.add(id);const cue={guard:'shield',castleReached:'gate',phaseChange:'crown',victory:'win',dieRolled:'die',levelUp:'level',hit:'hit'}[f.t]||(f.t==='gold'&&f.delta>0?'coin':null);if(cue)out.push(cue)});if(seen.size>500)for(const k of [...seen].slice(0,seen.size-500))seen.delete(k);return out}
const road='G4 - B4 - D5 - B4 - C5 - A4 - G4 ~ ~ - E4 - G4 - A4 - B4 - A4 ~ ~ - - - D4 - G4 - B4 - D5 - E5 - D5 - B4 - A4 ~ G4 - E4 - G4 - A4 - B4 A4 G4 ~ ~ ~ - - - -'.split(' ');
const battle='A4 - C5 - E5 ~ D5 C5 F4 - A4 - C5 ~ B4 A4 D4 - F4 - A4 ~ G4 F4 E4 ~ G#4 ~ B4 ~ - -'.split(' ');
const king='D4 ~ ~ Eb4 D4 ~ C4 ~ Bb3 ~ A3 ~ ~ ~ - - D4 ~ F4 ~ G4 ~ A4 Bb4 A4 ~ ~ ~ G4 F4 E4 ~'.split(' ');

const roadBass='G2 D3 G2 D3 C3 G2 C3 G2 E2 B2 E2 B2 D2 A2 D2 A2 G2 D3 G2 D3 C3 G2 D3 D2 C3 G2 D3 A2 G2 D3 G2 -'.split(' ');
const battleBass='A2 A2 E3 A2 A2 E3 A2 G2 F2 F2 C3 F2 F2 C3 F2 E2 D2 D2 A2 D2 D2 A2 D2 E2 E2 E2 B2 E2 G#2 G#2 B2 E2'.split(' ');
export function scoreStep(mode,index,band=1,phase=0){
 const bpm=mode==='king'?(phase?104:92):mode==='battle'?140:[104,100,96,88,108][band-1]||100;
 const step=30/bpm,melody=mode==='king'?king:mode==='battle'?battle:road,idx=index%melody.length,beat=index%8,voices=[];
 function note(n,o,v,d,lp,octave=0){const f=frequency(n)*2**octave;if(f)voices.push({o,f,a:5,d,v,...(lp?{lp}:{})})}
 let sustain=1;while(melody[(idx+sustain)%melody.length]==='~'&&sustain<8)sustain++;
 const d=Math.max(mode==='king'?250:mode==='battle'?180:220,step*sustain*1000-20);
 if(mode==='road'){
  note(melody[idx],'triangle',.1,d,band===4?1800:null);note(melody[idx],'sine',.03,d,null,-1);
  if(index%2===0)note(roadBass[Math.floor(index/2)%32],'sine',.14,300);
  if(beat===2||beat===6)voices.push({o:'noise',ft:'bandpass',f:2500,q:3,a:1,d:20,v:.06});
  if(beat===0)voices.push({o:'sine',f:90,a:2,d:60,v:.1});
  if(band===5&&(beat===2||beat===6))voices.push({o:'noise',ft:'highpass',f:1500,a:1,d:90,v:.07});
 }else if(mode==='battle'){
  note(melody[idx],'sawtooth',.06,d,2200,index%64>=32&&idx<16?1:0);note(battleBass[idx],'square',.08,140,800);
  if(beat===0||beat===4)voices.push({o:'sine',f:150,f2:45,g:120,a:2,d:120,v:.25});
  if(beat===2||beat===6)voices.push({o:'noise',ft:'highpass',f:1500,a:1,d:90,v:.1});
  voices.push({o:'noise',ft:'highpass',f:7000,a:1,d:25,v:.03});
 }else{
  note(melody[idx],'square',.07,d,1800);if(phase&&idx>=16)note(melody[idx],'square',.035,d,1800,1);
  if(beat===0){for(const o of ['sawtooth','square'])note(['D2','D2','Bb1','A1'][Math.floor(idx/8)],o,.03,step*8*1000,700)}
  if(beat===0||(phase&&beat===4))voices.push({o:'sine',f:73,f2:55,g:300,a:3,d:300,v:.2});
 }
 return {step,voices};
}
// Snapshot plain JSON using data descriptors only; no caller getters are invoked.
function ownJSON(value,seen=new Set()){
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(!value||typeof value!=='object'||seen.has(value))throw TypeError('invalid JSON');
 const array=Array.isArray(value),proto=Object.getPrototypeOf(value);
 if(!array&&proto!==null&&Object.getPrototypeOf(proto)!==null)throw TypeError('nonplain JSON');
 const ds=Object.getOwnPropertyDescriptors(value),ks=Reflect.ownKeys(ds);
 if(ks.some(k=>typeof k!=='string'||(!array||k!=='length')&&(!ds[k].enumerable||!Object.hasOwn(ds[k],'value'))))throw TypeError('accessor JSON');
 if(array&&(ks.length!==value.length+1||Array.from({length:value.length},(_,i)=>String(i)).some(k=>!Object.hasOwn(ds,k))))throw TypeError('sparse JSON');
 seen.add(value);const out=array?[]:{};
 for(const k of ks){if(array&&k==='length')continue;Object.defineProperty(out,k,{value:ownJSON(ds[k].value,seen),enumerable:true,writable:true,configurable:true})}
 seen.delete(value);return out;
}
// Records originate only from the app's validated successful-act receipt.
function validRecordCues(cues,key=null){try{
 cues=ownJSON(cues);
 if(!Array.isArray(cues)||cues.length>2)return [];
 const keys=new Set();
 for(let i=0;i<cues.length;i++){
  if(!Object.hasOwn(cues,i))return [];
  const c=cues[i];if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).length!==2||!['best','new.entry'].includes(c.cue)||typeof c.key!=='string'||keys.has(c.key))return [];
  const suffix=`:meta:${c.cue}`,prefix=c.key.endsWith(suffix)?c.key.slice(0,-suffix.length):'';
  if(!/^.+:[0-9]+$/.test(prefix)||(key!==null&&prefix!==key))return [];
  keys.add(c.key);
 }
 if(Object.keys(cues).length!==cues.length)return [];
 return cues.map(c=>({key:c.key,cue:c.cue}));
 }catch{return []}
}
export function createAudio(){
 let ctx,music,se,master,compressor,noise,settings={},timer=0,index=0,mode='road',band=1,phase=0,pendingPhase=0,nextTime=0,duckedUntil=0,menu=false;
 const recordSeen=new Set(),recordNodes=new Map(),skipKeys=new Set(),skipHandles=new Set();
 const seen=new Set(),nodes=new Set(),castleKeys=new Set();let castleState=null,castleTimer=0;let kingState=null;const kingKeys=new Set();let kingTurnState=null;const kingTurnKeys=new Set();let victoryState=null;const victoryKeys=new Set();let spellState=null;const spellKeys=new Set();
 function volume(initial=false){
  if(!ctx)return;
  const setGain=(param,target,time)=>{
   // A new GainNode starts at 1; do not ramp down from audible gain on first unlock.
   if(initial&&target===0)param.setValueAtTime(0,ctx.currentTime);
   else param.setTargetAtTime(target,ctx.currentTime,time);
  };
  setGain(master.gain,settings.mute?0:(settings.masterVolume??.8),.03);
  setGain(se.gain,settings.seVolume??.8,.02);
  if(!kingState&&!kingTurnState?.paused&&(!castleState||castleState.arrived||castleState.cancelled))setGain(music.gain,castleState?0:(settings.bgmVolume??.5)*(menu?.5:1),.08);
 }
 function voice(v,when,bus=se){if(!ctx||!Number.isFinite(v.f)||!v.f)return;const t=Math.max(when,ctx.currentTime),a=(v.a??3)/1000,h=(v.h??0)/1000,d=(v.d??100)/1000,end=t+a+h+d;
  let source,filter=null;if(v.o==='noise'){source=ctx.createBufferSource();source.buffer=noise;source.loop=true;filter=ctx.createBiquadFilter();filter.type=v.ft||'lowpass';filter.frequency.setValueAtTime(v.f,t);filter.Q.value=v.q??1;if(v.f2)filter.frequency.exponentialRampToValueAtTime(v.f2,t+(v.g||100)/1000)}else{source=ctx.createOscillator();source.type=v.o||'sine';source.frequency.setValueAtTime(v.f,t);if(v.f2)source.frequency.exponentialRampToValueAtTime(v.f2,t+(v.g||100)/1000);source.detune.value=v.det||0;if(v.lp){filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=v.lp}}
  const gain=ctx.createGain();gain.gain.setValueAtTime(.0001,t);gain.gain.linearRampToValueAtTime(v.v??.1,t+a);gain.gain.setValueAtTime(v.v??.1,t+a+h);if(v.spark)for(let i=1;i<=7;i++)gain.gain.linearRampToValueAtTime(i%2?.03:.06,t+.005+i*.025);gain.gain.exponentialRampToValueAtTime(.0001,end);
  const panner=ctx.createStereoPanner?.();if(panner)panner.pan.value=v.pan||0;
  if(filter){source.connect(filter);filter.connect(gain)}else source.connect(gain);if(panner){gain.connect(panner);panner.connect(bus)}else gain.connect(bus);
  source.start(t);source.stop(end+.01);const record={source,bus};nodes.add(record);source.onended=()=>{nodes.delete(record);source.disconnect();filter?.disconnect();gain.disconnect();panner?.disconnect()};
 }
 function stop(which){clearTimeout(timer);timer=0;for(const record of nodes)if(!which||record.bus===which){try{record.source.stop()}catch{}nodes.delete(record)}}
 function schedule(){if(!ctx||ctx.state!=='running'||document.hidden||mode==='silence'){timer=0;return}while(nextTime<ctx.currentTime+.1){if(index%8===0)phase=pendingPhase;const s=scoreStep(mode,index,band,phase);if(nextTime>=duckedUntil)for(const v of s.voices)voice(v,nextTime,music);nextTime+=s.step;index++}timer=setTimeout(schedule,25)}
 function play(name,delay=0,options={}){if(spellState&&name==='cast'&&(options.spellKey!==spellState.key||spellState.closed||spellState.played.has('cast')))return;if(victoryState&&name==='victory'&&(options.victoryKey!==victoryState.key||victoryState.cancelled||victoryState.played))return;if(castleState&&(castleState.arrived||castleState.cancelled)){if(['step','step.first','land'].includes(name))return;if(name==='bell'&&(options.castleKey!==castleState.key||castleState.quietEnded||castleState.cancelled))return;if(!castleState.quietEnded&&name!=='bell')return;}playRecipe(name,delay,options);}
 function playRecipe(name,delay=0,options={}){if(!ctx||ctx.state!=='running'||document.hidden||settings.mute)return;let recipe=SFX[name];const t=ctx.currentTime+.01+delay;
  if(name==='coin.pay')recipe=SFX['coin.in'].map(v=>({...v,t:v.t===0?90:0}));
  if(name==='step.first')recipe=SFX.step.map(v=>({...v,v:typeof v.v==='number'?v.v*1.25:v.v,det:100}));
  if(name==='bell')recipe=[{...recipe.strike,t:0},...recipe.partials.map(p=>({t:0,o:recipe.o,f:recipe.f0*p.r,a:recipe.a,d:p.d,v:p.v}))];
  if(name==='support'){const a=SFX['join.answer'],r=a[options.role==='thrower'?'archer':options.role||'shield'];recipe=[{...r,f:r.notes[1],t:0,a:a.a,d:120,v:a.v}]}
  if(name==='join.answer'){const role=options.role==='thrower'?'archer':options.role||'shield',r=recipe[role];recipe=r.notes.map((f,i)=>({...r,f,t:recipe.at+i*recipe.gap,a:recipe.a,d:recipe.d,v:recipe.v}));}
  if(name==='flee'){recipe=[...recipe.plus,...recipe.steps.flatMap((t,i)=>SFX.step.map(v=>({...v,t,pan:-i*.2,v:typeof v.v==='number'?v.v*.7:v.v})))];}
  if(recipe?.repeat)recipe=(settings.animation==='short'&&recipe.short?recipe.short:recipe.repeat).flatMap(t=>recipe.voice.map(v=>({...v,t})));
  if(!Array.isArray(recipe))return;
  const ground=[['bandpass',1800,1.2,.12],['bandpass',900,1.2,.14],['bandpass',600,1.2,.16],['lowpass',700,.7,.1],['bandpass',420,2,.16]][band-1]||['bandpass',1800,1.2,.12];
  for(const raw of recipe){const v={...raw,...(options.pan!==undefined?{pan:options.pan}:{}),...(options.det!==undefined?{det:options.det}:{})};for(const [k,value]of [['ft',ground[0]],['f',ground[1]],['q',ground[2]],['v',ground[3]]])if(typeof v[k]==='string'&&v[k].startsWith('BAND_'))v[k]=value;voice(v,t+(v.t||0)/1000)}
  if((name==='step'||name==='step.first')&&(band===3||band===5))voice({o:'noise',ft:'bandpass',f:2500,q:6,a:1,d:6,v:.1},t);if(name==='land'&&band===2)voice({o:'noise',ft:'highpass',f:3000,a:1,d:30,v:.08},t);
 }
 function cancelCastle(){clearTimeout(castleTimer);castleTimer=0;if(castleState){castleState.cancelled=true;castleKeys.add(castleState.key)}}
 function castle({type,key}={}){
  if(typeof key!=='string'||!key)return;
  if(type==='cancel'||type==='skip'){if(castleState?.key===key){cancelCastle();stop();mode='silence';volume()}return}
  if(type==='fade'){
   if(castleState?.key===key)return;
   if(castleKeys.has(key)){if(!castleState){castleState={key,cancelled:true,arrived:true};stop();mode='silence';volume()}return;}
   cancelCastle();castleState={key,cancelled:false,arrived:false};castleKeys.add(key);
   clearTimeout(timer);timer=0;mode='silence';
   if(ctx){music.gain.cancelScheduledValues(ctx.currentTime);music.gain.setValueAtTime(music.gain.value,ctx.currentTime);music.gain.linearRampToValueAtTime(0,ctx.currentTime+.6)}
   return;
  }
  if(type!=='arrive'||castleState?.key!==key||castleState.cancelled||castleState.arrived)return;
  castleState.arrived=true;stop();volume();
  if(!ctx||ctx.state!=='running'||document.hidden||settings.mute){cancelCastle();return}
  const current=castleState;
  castleTimer=setTimeout(()=>{castleTimer=0;if(castleState!==current||current.cancelled||!ctx||ctx.state!=='running'||document.hidden||settings.mute)return;play('bell',0,{castleKey:key});current.quietEnded=true},settings.animation==='short'?500:1000);
 }
 function cancelKing(){if(!kingState)return;kingState=null;if(ctx){music.gain.cancelScheduledValues(ctx.currentTime);music.gain.setValueAtTime(0,ctx.currentTime)}stop(music);mode='silence';}
 function king({type,key,view}={}){
  if(typeof key!=='string'||!key)return;
  if(type==='cancel'){if(kingState?.key===key)cancelKing();return}
  if(type==='finish'){if(kingState?.key===key){kingState=null;volume()}return}
  if(type!=='start'||kingKeys.has(key)||view?.battle?.kind!=='king')return;
  cancelKing();kingKeys.add(key);cancelCastle();castleState=null;stop();mode='silence';
  if(!ctx||ctx.state!=='running'||document.hidden||settings.mute)return;
  kingState={key};mode='king';band=view.board?.band?.id||5;phase=view.battle.phase?.index||0;pendingPhase=phase;index=0;nextTime=ctx.currentTime+.03;
  music.gain.cancelScheduledValues(ctx.currentTime);music.gain.setValueAtTime(0,ctx.currentTime);music.gain.linearRampToValueAtTime(settings.bgmVolume??.5,ctx.currentTime+.8);schedule();
 }
 // Turn ownership is transient; caller supplies only committed before/after views.
 function cancelKingTurn(){if(!kingTurnState)return;kingTurnState=null;stop();mode='silence';if(ctx){music.gain.cancelScheduledValues(ctx.currentTime);music.gain.setValueAtTime(0,ctx.currentTime)}}
 function kingTurn({type,key,view}={}){
  if(typeof key!=='string'||!key)return;
  if(type==='start'){
   if(kingTurnKeys.has(key)||view?.battle?.kind!=='king'||![0,1].includes(view.battle.phase?.index))return;
   cancelKingTurn();cancelKing();cancelCastle();castleState=null;kingTurnKeys.add(key);
   if(!ctx||ctx.state!=='running'||document.hidden||settings.mute){stop();mode='silence';return;}
   const continuing=mode==='king';kingTurnState={key,paused:false};mode='king';band=view.board?.band?.id||5;
   // Start with the announced turn's phase, never the already committed next phase.
   phase=view.battle.phase.index;pendingPhase=phase;
   if(!continuing){stop(music);index=0;nextTime=ctx.currentTime+.03;}
   volume();if(!timer)schedule();return;
  }
  if(kingTurnState?.key!==key)return;
  if(type==='cancel'||type==='skip'){cancelKingTurn();return;}
  if(type==='pause'){
   if(kingTurnState.paused)return;kingTurnState.paused=true;stop(music);mode='silence';
   music.gain.cancelScheduledValues(ctx.currentTime);music.gain.setValueAtTime(0,ctx.currentTime);return;
  }
  if(type==='resume'){
   if(!kingTurnState.paused)return;kingTurnState.paused=false;mode='king';nextTime=ctx.currentTime+.03;volume();schedule();return;
  }
  if(type==='finish'){
   if(view?.battle?.kind!=='king'||![0,1].includes(view.battle.phase?.index)){cancelKingTurn();return;}
   const paused=kingTurnState.paused;kingTurnState=null;pendingPhase=view.battle.phase.index;
   // schedule() adopts pendingPhase only at the existing eight-step bar boundary.
   mode='king';volume();if(paused||!timer){nextTime=ctx.currentTime+.03;schedule();}
  }
 }
 function cancelVictory(){if(!victoryState)return;victoryState.cancelled=true;cancelKingTurn();stop();mode='silence';}
 function kingVictory({type,key,view}={}){
  if(typeof key!=='string'||!key)return;
  if(type==='start'){
   if(victoryKeys.has(key)||view?.battle?.kind!=='king'||view.battle.stage!=='fight')return;
   cancelVictory();victoryKeys.add(key);victoryState={key,stopped:false,played:false,cancelled:!ctx||ctx.state!=='running'||document.hidden||!!settings.mute};
   kingTurn({type:'start',key,view});return;
  }
  if(victoryState?.key!==key)return;
  if(type==='cancel'||type==='skip'){cancelVictory();return;}
  if(victoryState.cancelled)return;
  if(type==='stop'){
   if(victoryState.stopped)return;victoryState.stopped=true;cancelKingTurn();stop(music);mode='silence';return;
  }
  if(type==='cue'){
   if(!victoryState.stopped||victoryState.played)return;
   // Consume even if audio availability changed; no deferred replay.
   play('victory',0,{victoryKey:key});victoryState.played=true;return;
  }
  if(type==='finish'){
   if(!victoryState.stopped||view?.battle?.kind!=='king'||view.battle.stage!=='won'){cancelVictory();return;}
   stop(music);mode='silence';victoryState.finished=true;
  }
 }
 function cancelSpell(){if(!spellState)return;spellState.closed=true;for(const record of spellState.nodes){try{record.source.stop()}catch{}nodes.delete(record)}spellState.nodes.clear();}
 const supportedSpellIds=Object.freeze(['SP01','SP02','SP03','SP04']);
 function spell({type,key,spellId,cue}={}){
  if(typeof key!=='string'||!key)return;
  if(type==='start'){
   if(!supportedSpellIds.includes(spellId)||spellKeys.has(key))return;
   cancelSpell();spellKeys.add(key);spellState={key,spellId,additive:'cast.'+spellId.toLowerCase(),played:new Set(),nodes:new Set(),closed:!ctx||ctx.state!=='running'||document.hidden||!!settings.mute};return;
  }
  if(spellState?.key!==key||(spellId!==undefined&&spellId!==spellState.spellId))return;
  if(type==='cancel'||type==='skip'){cancelSpell();return;}
  if(type==='finish'){spellState.closed=true;return;}
  if(type!=='cue'||spellState.closed||(cue!=='cast'&&cue!==spellState.additive)||spellState.played.has(cue)||(cue===spellState.additive&&!spellState.played.has('cast')))return;
  if(!ctx||ctx.state!=='running'||document.hidden||settings.mute){cancelSpell();return;}
  const previous=new Set(nodes);
  if(cue==='cast')play('cast',0,{spellKey:key});
  else if(cue==='cast.sp01')voice({o:'noise',ft:'highpass',f:4000,a:5,d:200,v:.06,spark:true},ctx.currentTime+.01);
  else if(cue==='cast.sp02')play('heal');
  else if(cue==='cast.sp03')voice({o:'sine',f:1250,a:1,d:320,v:.06},ctx.currentTime+.01);
  else for(const v of SFX.slash)voice(v.f2===5000?{...v,f2:8000}:v,ctx.currentTime+.01+(v.t||0)/1000);
  spellState.played.add(cue);for(const record of nodes)if(!previous.has(record))spellState.nodes.add(record);
 }
 Object.defineProperty(spell,'supportedIds',{value:supportedSpellIds});
 function prepareCommittedSkip(key,steps){
  const noop={play(){return false},cancel(){}};
  try{steps=ownJSON(steps)}catch{return noop}
  if(typeof key!=='string'||!/^.+:[0-9]+$/.test(key)||skipKeys.has(key)||!Array.isArray(steps)||steps.length>2)return noop;
  const ids=new Set(),metadata=[];
  const allowed=new Set(['victory','defeat','win.battle','levelup','crown.crack','tell.big','shield','slash','hit.party','heal','heal.full','coin.in','coin.pay','bag','sheath','buckle','bell','door.bell','cast','cast.sp01','cast.sp02','cast.sp03','cast.sp04','flee','item.use','join.call','join.answer','job.change','learn','rest','chest.open','bag.full','charm','encounter','tell.attack','tell.guard','tell.open','support','dice.lock']);
  for(let i=0;i<steps.length;i++){
   const step=steps[i],p=step?.payload;
   if(!step||step.kind!=='sound'||step.atMs!==i*120||typeof step.key!=='string'||!step.key.startsWith(key+':')||ids.has(step.key)||p?.role!=='committed')return noop;
   if(p.options!==undefined){const o=p.options;if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!['role','pan','det'].includes(k))||('role' in o&&!['shield','medic','thrower','lantern','archer'].includes(o.role))||('pan' in o&&(typeof o.pan!=='number'||Math.abs(o.pan)>1))||('det' in o&&(typeof o.det!=='number'||Math.abs(o.det)>1200)))return noop;}
   if(p.recordCue){const c={key:step.key,cue:p.cue};if(!validRecordCues([c],key).length)return noop;metadata.push(c)}
   else if(!allowed.has(p.cue))return noop;
   ids.add(step.key);
  }
  skipKeys.add(key);
  const bellAlreadyHanded=castleState?.key===key&&!!(castleState.quietEnded||castleState.cancelled);
  const selected=steps.map(step=>({key:step.key,cue:step.payload.cue,recordCue:!!step.payload.recordCue,options:{...(step.payload.options||{})}}));
  const eligible=new Set(takeRecordCues(metadata,key).map(c=>c.key));
  const consumed=new Set(),owned=new Set();let closed=!ctx||ctx.state!=='running'||document.hidden||!!settings.mute;
  if(closed)discardRecordCues(metadata);
  const handle={
   play(stepKey){
    const item=selected.find(x=>x.key===stepKey);if(!item||consumed.has(stepKey))return false;consumed.add(stepKey);
    if(closed||!ctx||ctx.state!=='running'||document.hidden||settings.mute){closed=true;discardRecordCues(metadata);if(item.recordCue)discardRecordCues([{key:item.key,cue:item.cue}]);return false;}
    if(item.cue==='bell'&&bellAlreadyHanded)return false;
    const previous=new Set(nodes);
    if(item.recordCue){if(eligible.has(item.key))emitRecordCue({key:item.key,cue:item.cue});}
    else if(item.cue==='cast.sp01')voice({o:'noise',ft:'highpass',f:4000,a:5,d:200,v:.06,spark:true},ctx.currentTime+.01);
    else if(item.cue==='cast.sp02')playRecipe('heal');
    else if(item.cue==='cast.sp03')voice({o:'sine',f:1250,a:1,d:320,v:.06},ctx.currentTime+.01);
    else if(item.cue==='cast.sp04')for(const v of SFX.slash)voice(v.f2===5000?{...v,f2:8000}:v,ctx.currentTime+.01+(v.t||0)/1000);
    else playRecipe(item.cue,0,item.options);
    if(['crown.crack','tell.big'].includes(item.cue)){duckedUntil=ctx.currentTime+1;for(const n of nodes)if(n.bus===music){try{n.source.stop()}catch{}nodes.delete(n)}}
    for(const n of nodes)if(!previous.has(n))owned.add(n);
    return true;
   },
   cancel(){closed=true;for(const n of owned){try{n.source.stop()}catch{}nodes.delete(n)}owned.clear();discardRecordCues(metadata);skipHandles.delete(handle);}
  };skipHandles.add(handle);return handle;
 }
 function cancelCommittedSkips(){for(const h of [...skipHandles])h.cancel()}
 function discardRecordCues(cues){for(const c of validRecordCues(cues)){recordSeen.add(c.key);const owned=recordNodes.get(c.key);if(owned)for(const n of owned){try{n.source.stop()}catch{}nodes.delete(n)}recordNodes.delete(c.key)}}
 function takeRecordCues(cues,key=null){return validRecordCues(cues,key).filter(c=>{if(recordSeen.has(c.key))return false;recordSeen.add(c.key);return true})}
 function emitRecordCue(c){
  if(!ctx||ctx.state!=='running'||document.hidden||settings.mute)return;
  const previous=new Set(nodes);
  // Only two fixed metadata recipes; never a bypass for battle/castle/spell cues.
  for(const v of SFX[c.cue])voice(v,ctx.currentTime+.01+(v.t||0)/1000);
  recordNodes.set(c.key,new Set([...nodes].filter(n=>!previous.has(n))));
 }
 function recordCue(c){for(const item of takeRecordCues([c]))emitRecordCue(item)}
 const api={prepareCommittedSkip,recordCue,discardRecordCues,castle,king,kingTurn,kingVictory,spell,async unlock(){try{if(!ctx){const C=globalThis.AudioContext||globalThis.webkitAudioContext;if(!C)return;ctx=new C();if(globalThis.navigator?.audioSession)navigator.audioSession.type='ambient';music=ctx.createGain();se=ctx.createGain();master=ctx.createGain();compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-10;compressor.ratio.value=4;compressor.attack.value=.003;compressor.release.value=.12;music.connect(master);se.connect(master);master.connect(compressor);compressor.connect(ctx.destination);noise=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);const a=noise.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=Math.random()*2-1;volume(true)}await ctx.resume();if(!timer){nextTime=ctx.currentTime+.03;schedule()}}catch{/* sound failures never affect saving */}},configure(next){if(!settings.mute&&next?.mute){cancelCommittedSkips();cancelSpell();cancelVictory();cancelKingTurn();cancelKing();cancelCastle();for(const record of nodes)if(record.bus===se){try{record.source.stop()}catch{}nodes.delete(record)}}settings=next||{};volume()},scene(v){if(victoryState){if(v?.battle?.kind==='king'){if(victoryState.stopped||victoryState.cancelled){stop(music);mode='silence';}volume();return;}cancelVictory();victoryState=null;}if(kingTurnState){if(v?.battle?.kind==='king'){volume();return}cancelKingTurn()}if(kingState){if(v?.battle?.kind==='king'){volume();return}cancelKing()}if(castleState){if(!v||v.phase==='gate'){if(v?.phase==='gate'&&castleState.cancelled)castleState.quietEnded=true;volume();return}cancelCastle();castleState=null}const next=v?.phase==='gate'||v?.phase==='finished'||v?.battle?.kind==='king'&&v.battle.stage==='won'?'silence':v?.battle?(v.battle.kind==='king'?'king':'battle'):'road';band=v?.board.band?.id||1;pendingPhase=v?.battle?.phase.index||0;menu=v?.phase==='inn';if(next!==mode){stop(music);mode=next;index=0;phase=pendingPhase;if(ctx){nextTime=ctx.currentTime+.03;schedule()}}volume()},menu(open){menu=open;volume()},play,
 effects(fx,key,{committedCues=[]}={}){const records=takeRecordCues(committedCues,key);if(spellState&&key!==spellState.key){cancelSpell();spellState=null;}if(!ctx||ctx.state!=='running'||document.hidden)return;const unique=fx.filter((f,i)=>!seen.has(`${key}:${i}`));const all=effectCues(fx,key,seen);void all;const terminalLoss=unique.some(f=>f.t==='runFinished'&&f.result?.defeated===false);const events=unique;
  for(const c of records)emitRecordCue(c);
  let delay=0;for(const f of events){if(terminalLoss&&f.t==='defeat')continue;if(f.t==='castleReached'){if(castleKeys.has(key))continue;castleKeys.add(key)}let cue=({guard:'shield',castleReached:'bell',phaseChange:'crown.crack',victory:'win.battle',levelUp:'levelup',rested:'rest',jobChanged:'job.change',companionJoined:'join.call',companionSwapped:'join.call',itemGained:'bag',itemUsed:'item.use',bagFull:'bag.full',spellLearned:'learn',spellCast:'cast',fled:'flee',innArrived:'door.bell',chestOpened:'chest.open',trapAvoided:'charm',battleStart:'encounter',defeat:'defeat'}[f.t]);if(f.t==='runFinished')cue=f.result?.defeated?'victory':'defeat';if(f.t==='gold')cue=f.delta>0?'coin.in':f.delta<0?'coin.pay':null;if(f.t==='hit')cue=f.target==='hero'?'hit.party':'slash';if(f.t==='hp'&&f.delta>0)cue='heal';if(f.t==='enemyTell')cue=/大/.test(f.kind)?'tell.big':/守/.test(f.kind)?'tell.guard':/隙/.test(f.kind)?'tell.open':'tell.attack';if(f.t==='equipped')cue=f.slot==='armor'?'buckle':'sheath';
   if(f.t==='dieRolled'){play('dice.rattle',delay);play('dice.lock',delay+(settings.animation==='short'?.2:.65));continue}if(f.t==='moved'){for(let n=0;n<Math.min(f.steps,6);n++)play(n?'step':'step.first',delay+n*.12,{pan:n%2?.15:-.15,det:n%2?40:-40});if(f.stop!=='castle')play('land',delay+Math.min(f.steps,6)*.12);continue}
   if(f.t==='castleReached'){stop(music);duckedUntil=ctx.currentTime+4.6;delay=Math.max(delay,.45)}if(f.t==='phaseChange'||(f.t==='enemyTell'&&/大/.test(f.kind))){duckedUntil=ctx.currentTime+1;for(const n of nodes)if(n.bus===music){try{n.source.stop()}catch{}nodes.delete(n)}}if(f.t==='companion')play('support',delay,{role:f.role});
   if(cue){play(cue,delay);delay+=.06}if(f.t==='companionJoined'||f.t==='companionSwapped')play('join.answer',delay,{role:optionsRole(f.id||f.in)});
  }
 },stop(){cancelCommittedSkips();cancelSpell();cancelVictory();cancelKingTurn();cancelKing();cancelCastle();stop()}};
 function optionsRole(id){return {CP01:'shield',CP02:'medic',CP03:'thrower',CP04:'lantern'}[id]||'shield'}
 document.addEventListener('visibilitychange',()=>{cancelCommittedSkips();cancelSpell();cancelVictory();cancelKingTurn();cancelKing();cancelCastle();stop();if(document.hidden)ctx?.suspend()});return api;
}
