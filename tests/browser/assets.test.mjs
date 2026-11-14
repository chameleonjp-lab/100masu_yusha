import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from 'node:fs/promises';
test('all four actual companion roles have idle and support art, thrower has no bow',async()=>{for(const role of ['shield','medic','thrower','lantern'])for(const pose of ['idle','support']){const s=await readFile(new URL(`../../assets/characters/comp-${role}-${pose}.svg`,import.meta.url),'utf8').catch(()=>null);assert.ok(s,`${role}/${pose} art exists`);assert.ok(s.includes('viewBox='));if(role==='thrower'){assert.ok(!s.includes('data-part="bow"'));assert.ok(s.includes('data-part="stone"'))}}});

import {spriteMetrics} from '../../assets/characters/metrics.js';
test('all poses include full ink bounds plus safe padding and stable ground',()=>{for(const [name,m] of Object.entries(spriteMetrics)){const[x,y,w,h]=m.bounds,[l,t,vw,vh]=m.viewBox;assert.ok(x-l>=5.99,name);assert.ok(y-t>=5.99,name);assert.ok(l+vw-x-w>=5.99,name);assert.ok(t+vh-y-h>=5.99,name);assert.ok(m.anchorY>0&&m.anchorY<100,name)}});

import {readdir} from 'node:fs/promises';
test('each standalone sprite resolves every local use reference within its own document',async()=>{
 const dir=new URL('../../assets/characters/',import.meta.url);
 for(const name of (await readdir(dir)).filter(n=>n.endsWith('.svg'))){
  const s=await readFile(new URL(name,dir),'utf8');
  const ids=new Set([...s.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]));
  for(const ref of s.matchAll(/<use\b[^>]*\bhref=["']#([^"']+)["']/g)) assert.ok(ids.has(ref[1]),`${name}: unresolved #${ref[1]}`);
 }
});
