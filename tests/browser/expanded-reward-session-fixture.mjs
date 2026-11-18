import test from 'node:test';import assert from 'node:assert/strict';
import {getContent,exampleRun,place,walk} from '../fixtures/helpers.mjs';
import {dispatch,createMeta} from '../../src/engine/index.js';
import {createSession} from '../../src/ui/session.js';
import {createMemoryStore} from '../../src/save/index.js';
import {planPresentation} from '../../src/ui/presentation-timeline.js';
const c=await getContent();
const opts={kingRewardVisual:true,kingExpandedRewardVisual:true,kingSpellTimeline:true,spellVisual:true,victoryVisual:true,kingTurnVisual:true};
const stages=p=>p.steps.filter(s=>s.payload.stage?.startsWith('king.reward.'));
async function fixture({seed=1,spell,level=20,bag=false,revealed=false,hp=70,enemyHp=4,companions=[],opening=false}={}){
 const run=dispatch(c,walk(c,place(exampleRun(c,'M',seed),99,{level,xp:level===20?912:828,hp,companions,mp:level===20?48:46,
  ...(spell?{spells:{learned:[spell],prepared:[spell]}}:{}),bag:bag?Array(6).fill(Object.keys(c.items)[0]):[]}),1).state,{type:'challengeKing'}).state;
 run.battle.enemy.hp=enemyHp;if(opening)for(const a of [run.battle.current,run.battle.rounds.at(-1).enemyAction]){a.kind='反撃の隙';a.attack=0;}
 if(revealed)run.discovered.gear=Object.keys(c.gear);
 const store=createMemoryStore();await store.startNew({run,meta:createMeta()});const s=createSession(c,store);await s.load();
 const before=structuredClone(s.view),effects=await s.act(spell?{type:'spell',spellId:spell}:{type:'attack'}),after=structuredClone(s.view);return {before,after,effects,store};
}

export {fixture};
