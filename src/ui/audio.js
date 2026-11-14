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
export function createAudio(){
 let ctx,music,se,master,compressor,noise,settings={},timer=0,index=0,mode='road',band=1,phase=0,pendingPhase=0,nextTime=0,duckedUntil=0,menu=false;
 const seen=new Set(),nodes=new Set();
 function volume(){if(!ctx)return;master.gain.setTargetAtTime(settings.mute?0:(settings.masterVolume??.8),ctx.currentTime,.03);se.gain.setTargetAtTime(settings.seVolume??.8,ctx.currentTime,.02);music.gain.setTargetAtTime((settings.bgmVolume??.5)*(menu?.5:1),ctx.currentTime,.08)}
 function voice(v,when,bus=se){if(!ctx||!Number.isFinite(v.f)||!v.f)return;const t=Math.max(when,ctx.currentTime),a=(v.a??3)/1000,h=(v.h??0)/1000,d=(v.d??100)/1000,end=t+a+h+d;
  let source,filter=null;if(v.o==='noise'){source=ctx.createBufferSource();source.buffer=noise;source.loop=true;filter=ctx.createBiquadFilter();filter.type=v.ft||'lowpass';filter.frequency.setValueAtTime(v.f,t);filter.Q.value=v.q??1;if(v.f2)filter.frequency.exponentialRampToValueAtTime(v.f2,t+(v.g||100)/1000)}else{source=ctx.createOscillator();source.type=v.o||'sine';source.frequency.setValueAtTime(v.f,t);if(v.f2)source.frequency.exponentialRampToValueAtTime(v.f2,t+(v.g||100)/1000);source.detune.value=v.det||0;if(v.lp){filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=v.lp}}
  const gain=ctx.createGain();gain.gain.setValueAtTime(.0001,t);gain.gain.linearRampToValueAtTime(v.v??.1,t+a);gain.gain.setValueAtTime(v.v??.1,t+a+h);gain.gain.exponentialRampToValueAtTime(.0001,end);
  const panner=ctx.createStereoPanner?.();if(panner)panner.pan.value=v.pan||0;
  if(filter){source.connect(filter);filter.connect(gain)}else source.connect(gain);if(panner){gain.connect(panner);panner.connect(bus)}else gain.connect(bus);
  source.start(t);source.stop(end+.01);const record={source,bus};nodes.add(record);source.onended=()=>{nodes.delete(record);source.disconnect();filter?.disconnect();gain.disconnect();panner?.disconnect()};
 }
 function stop(which){clearTimeout(timer);timer=0;for(const record of nodes)if(!which||record.bus===which){try{record.source.stop()}catch{}nodes.delete(record)}}
 function schedule(){if(!ctx||ctx.state!=='running'||document.hidden||mode==='silence'){timer=0;return}while(nextTime<ctx.currentTime+.1){if(index%8===0)phase=pendingPhase;const s=scoreStep(mode,index,band,phase);if(nextTime>=duckedUntil)for(const v of s.voices)voice(v,nextTime,music);nextTime+=s.step;index++}timer=setTimeout(schedule,25)}
 function play(name,delay=0,options={}){if(!ctx||ctx.state!=='running'||document.hidden||settings.mute)return;let recipe=SFX[name];const t=ctx.currentTime+.01+delay;
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
 const api={async unlock(){try{if(!ctx){const C=globalThis.AudioContext||globalThis.webkitAudioContext;if(!C)return;ctx=new C();if(globalThis.navigator?.audioSession)navigator.audioSession.type='ambient';music=ctx.createGain();se=ctx.createGain();master=ctx.createGain();compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-10;compressor.ratio.value=4;compressor.attack.value=.003;compressor.release.value=.12;music.connect(master);se.connect(master);master.connect(compressor);compressor.connect(ctx.destination);noise=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);const a=noise.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=Math.random()*2-1;volume()}await ctx.resume();if(!timer){nextTime=ctx.currentTime+.03;schedule()}}catch{/* sound failures never affect saving */}},configure(next){if(!settings.mute&&next?.mute){for(const record of nodes)if(record.bus===se){try{record.source.stop()}catch{}nodes.delete(record)}}settings=next||{};volume()},scene(v){const next=v?.phase==='gate'||v?.phase==='finished'?'silence':v?.battle?(v.battle.kind==='king'?'king':'battle'):'road';band=v?.board.band?.id||1;pendingPhase=v?.battle?.phase.index||0;menu=v?.phase==='inn';if(next!==mode){stop(music);mode=next;index=0;phase=pendingPhase;if(ctx){nextTime=ctx.currentTime+.03;schedule()}}volume()},menu(open){menu=open;volume()},play,
 effects(fx,key){if(!ctx||ctx.state!=='running'||document.hidden)return;const unique=fx.filter((f,i)=>!seen.has(`${key}:${i}`));const all=effectCues(fx,key,seen);void all;let events=unique;const critical=new Set(['castleReached','phaseChange','victory','runFinished','levelUp']);if(settings.animation==='short')events=events.filter(f=>critical.has(f.t)||['dieRolled','moved','hit','gold','enemyTell'].includes(f.t)).slice(-2);
  let delay=0;for(const f of events){let cue=({guard:'shield',castleReached:'bell',phaseChange:'crown.crack',victory:'win.battle',levelUp:'levelup',rested:'rest',jobChanged:'job.change',companionJoined:'join.call',companionSwapped:'join.call',itemGained:'bag',itemUsed:'item.use',bagFull:'bag.full',spellLearned:'learn',spellCast:'cast',fled:'flee',innArrived:'door.bell',chestOpened:'chest.open',trapAvoided:'charm',battleStart:'encounter',defeat:'defeat'}[f.t]);if(f.t==='runFinished')cue=f.result?.defeated?'victory':'defeat';if(f.t==='gold')cue=f.delta>0?'coin.in':f.delta<0?'coin.pay':null;if(f.t==='hit')cue=f.target==='hero'?'hit.party':'slash';if(f.t==='hp'&&f.delta>0)cue='heal';if(f.t==='enemyTell')cue=/大/.test(f.kind)?'tell.big':/守/.test(f.kind)?'tell.guard':/隙/.test(f.kind)?'tell.open':'tell.attack';if(f.t==='equipped')cue=f.slot==='armor'?'buckle':'sheath';
   if(f.t==='dieRolled'){play('dice.rattle',delay);play('dice.lock',delay+(settings.animation==='short'?.2:.65));continue}if(f.t==='moved'){for(let n=0;n<Math.min(f.steps,6);n++)play(n?'step':'step.first',delay+n*.12,{pan:n%2?.15:-.15,det:n%2?40:-40});play('land',delay+Math.min(f.steps,6)*.12);continue}
   if(f.t==='castleReached'){stop(music);duckedUntil=ctx.currentTime+4.6;delay=Math.max(delay,.45)}if(f.t==='phaseChange'||(f.t==='enemyTell'&&/大/.test(f.kind))){duckedUntil=ctx.currentTime+1;for(const n of nodes)if(n.bus===music){try{n.source.stop()}catch{}nodes.delete(n)}}if(f.t==='companion')play('support',delay,{role:f.role});
   if(cue){play(cue,delay);delay+=.06}if(f.t==='companionJoined'||f.t==='companionSwapped')play('join.answer',delay,{role:optionsRole(f.id||f.in)});
  }
 },stop};
 function optionsRole(id){return {CP01:'shield',CP02:'medic',CP03:'thrower',CP04:'lantern'}[id]||'shield'}
 document.addEventListener('visibilitychange',()=>{stop();if(document.hidden)ctx?.suspend()});return api;
}
