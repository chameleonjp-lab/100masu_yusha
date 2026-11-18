import test from 'node:test';import assert from 'node:assert/strict';
import {createStage} from '../../src/ui/stage.js';
function harness(){
 let now=0,id=0;const callbacks=new Map(),listeners=new Map();
 globalThis.document={hidden:false,addEventListener:(n,f)=>listeners.set(n,f),removeEventListener(){}};
 globalThis.ResizeObserver=class{observe(){}disconnect(){}};
 globalThis.requestAnimationFrame=f=>{callbacks.set(++id,f);return id};globalThis.cancelAnimationFrame=i=>callbacks.delete(i);
 globalThis.performance={now:()=>now};
 const canvas={style:{},getContext:()=>null,addEventListener(){},removeEventListener(){}};
 const stage=createStage(canvas);return {stage,canvas,callbacks,listeners,advance(t){now=t;const fs=[...callbacks.values()];callbacks.clear();fs.forEach(f=>f(t))}};
}
test('normal transition interpolates sky and survives same-band walk update',()=>{
 const h=harness();h.stage.update({band:1});const start=h.canvas.style.background;
 h.stage.transitionRegion({fromBand:1,band:2,durationMs:1200});h.advance(600);const mid=h.canvas.style.background;
 assert.notEqual(mid,start);h.stage.update({band:2,pos:22});assert.equal(h.canvas.style.background,mid);
 h.advance(1200);assert.notEqual(h.canvas.style.background,mid);assert.equal(h.callbacks.size,0);
});
test('short transition finishes in 400ms; cancel snaps final and stale callbacks cannot overwrite',()=>{
 const h=harness();const handle=h.stage.transitionRegion({fromBand:2,band:3,durationMs:400});const stale=[...h.callbacks.values()][0];h.advance(200);handle.cancel();const final=h.canvas.style.background;
 stale(250);assert.equal(h.canvas.style.background,final);assert.equal(h.callbacks.size,0);
});
test('reduced transition ends at 300ms; hide and disposal clear callbacks',()=>{
 const h=harness();h.stage.transitionRegion({fromBand:3,band:4,durationMs:1200,reducedMotion:true});h.advance(300);assert.equal(h.callbacks.size,0);
 h.stage.transitionRegion({fromBand:4,band:5});document.hidden=true;h.listeners.get('visibilitychange')();assert.equal(h.callbacks.size,0);
 h.stage.dispose();assert.doesNotThrow(()=>h.stage.cancelTransition());
});
test('castle scale keeps defined regional and 95–99 values without reduced scale animation',async()=>{
 const {castleScale,regionFrame}=await import('../../src/ui/stage.js');
 assert.deepEqual([1,2,3,4,5].map(x=>castleScale(x)),[.22,.36,.52,.7,.92]);
 assert.deepEqual([95,96,97,98,99].map(x=>castleScale(5,x)),[1,1.0375,1.075,1.1125,1.15]);
 assert.equal(regionFrame(1,2,0,true).scale,.36);assert.equal(regionFrame(1,2,.5,true).scale,.36);
 assert.ok(regionFrame(1,2,.5).scale>.22);assert.ok(regionFrame(1,2,.5).scale<.36);
});
test('superseded handle and disposed callbacks never overwrite newer region',()=>{
 const h=harness();const old=h.stage.transitionRegion({fromBand:1,band:2});const stale=[...h.callbacks.values()][0];
 h.stage.transitionRegion({fromBand:2,band:3});old.cancel();h.advance(1200);const final=h.canvas.style.background;stale(900);assert.equal(h.canvas.style.background,final);
 h.stage.transitionRegion({fromBand:3,band:4});const queued=[...h.callbacks.values()][0];h.stage.dispose();const disposed=h.canvas.style.background;queued(1400);assert.equal(h.canvas.style.background,disposed);
});
