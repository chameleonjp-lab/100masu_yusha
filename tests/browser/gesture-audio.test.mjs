import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../../src/ui/app.js',import.meta.url),'utf8');
const block=source.slice(source.indexOf('function button('),source.indexOf('// BEGIN saved result marks'));

function setup(){
 const attempts=[],played=[],discarded=[],actions=[];
 const session={run:{runId:'run',revision:1},meta:{settings:{mute:false}}};
 const c=vm.createContext({
  document:{hidden:false},session,screen:'game',pendingFleeSound:null,cancelSkipSound(){},
  el:()=>({addEventListener(_,fn){this.click=fn}}),
  sound:{
   unlock(){return new Promise((resolve,reject)=>attempts.push({resolve,reject}))},
   play(cue){played.push(cue)},
   effects(fx,key){played.push(key)},
   discardRecordCues(cues){discarded.push(...cues)}
  }
 });
 vm.runInContext(block,c);
 function execute(code){return vm.runInContext(code,c)}
 function tap(label,fn=()=>{}){c.action=()=>{actions.push(label);fn()};execute('button("",action).click()')}
 function prepare(){execute('prepareCommittedSound()')}
 function schedule(revision){execute(`scheduleCommittedSound([{}],"${revision}","run",${revision})`)}
 return {c,attempts,played,discarded,actions,execute,tap,prepare,schedule,session};
}
const flush=async()=>{await Promise.resolve();await Promise.resolve()};

for(const oldMode of ['resolve-first','resolve-last','reject-first'])test('a new form gesture supersedes a pending unlock: '+oldMode,async()=>{
 const h=setup();h.prepare();h.schedule(1);
 h.prepare();h.session.run.revision=2;h.schedule(2);
 assert.equal(h.attempts.length,2,'latest form gesture must request unlock immediately');
 if(oldMode!=='resolve-last'){
  h.attempts[0][oldMode.startsWith('reject')?'reject':'resolve']();await flush();
  assert.deepEqual(h.played,[],'obsolete unlock may not play or clear the latest effect');
 }
 h.attempts[1].resolve();await flush();assert.deepEqual(h.played,['2']);
 if(oldMode==='resolve-last'){h.attempts[0].resolve();await flush();assert.deepEqual(h.played,['2'])}
});

test('opening settings and closing while the first unlock is pending only plays the current tap',async()=>{
 const h=setup();h.tap('open');h.tap('close');
 assert.deepEqual(h.actions,['open','close'],'UI must not wait for audio');
 h.attempts[1].resolve();await flush();assert.deepEqual(h.played,['ui.tap']);
 h.attempts[0].resolve();await flush();assert.deepEqual(h.played,['ui.tap']);
});

test('quick consecutive buttons with prompt resumes can each play once, even if the button itself renders',async()=>{
 const h=setup();h.tap('open');h.attempts[0].resolve();await flush();
 h.tap('close',()=>h.execute('invalidateCommittedSound()'));h.attempts[1].resolve();await flush();
 assert.deepEqual(h.played,['ui.tap','ui.tap']);
});

for(const cancel of ['new form','later render','hidden','hidden then visible','muted'])test('a pending tap does not play after '+cancel,async()=>{
 const h=setup();h.tap('open');
 if(cancel==='new form')h.prepare();
 if(cancel==='later render')h.execute('invalidateCommittedSound()');
 if(cancel==='hidden')h.c.document.hidden=true;
 if(cancel==='hidden then visible'){h.c.document.hidden=true;h.execute('invalidateCommittedSound()');h.c.document.hidden=false;}
 if(cancel==='muted')h.session.meta.settings.mute=true;
 h.attempts[0].resolve();await flush();assert.deepEqual(h.played,[]);
});

test('a route button can keep its own prompt tap while starting departure audio',async()=>{
 const h=setup();
 h.tap('start',()=>h.execute('prepareCommittedSound({preserveTap:true})'));
 assert.equal(h.attempts.length,2);h.attempts[0].resolve();await flush();
 assert.deepEqual(h.played,['ui.tap']);
 h.schedule(1);h.attempts[1].resolve();await flush();
 assert.deepEqual(h.played,['ui.tap','1']);
});

test('a native close invalidates the pending tap of the gesture that opened that dialog',async()=>{
 const h=setup(),buttonNode=h.c.el;
 h.c.el=tag=>tag==='dialog'?{
  setAttribute(){},append(){},addEventListener(_,fn){this.onClose=fn},
  showModal(){this.open=true},close(){this.open=false;this.onClose()},remove(){}
 }:buttonNode();
 Object.assign(h.c,{crypto:{randomUUID:()=> 'id'},root:{append(){}},heading:()=>({}),add(){},msg:key=>key});
 h.c.sound.menu=()=>{};
 h.execute(source.match(/^function modal\([^\n]+/m)[0]);
 let dialog;h.tap('open',()=>{dialog=h.execute('modal("Settings")')});
 assert.equal(dialog.open,true);dialog.close();
 h.attempts[0].resolve();await flush();
 assert.deepEqual(h.played,['ui.cancel']);
});
