import {getContent,exampleRun,place,walk} from '../fixtures/helpers.mjs';
import {dispatch,createMeta} from '../../src/engine/index.js';
import {createSession} from '../../src/ui/session.js';
import {createMemoryStore} from '../../src/save/index.js';

// Stage tailored inputs, then commit the actual command through the real session.
const c=await getContent();
export async function fixture(id,{enemyHp=124,hp=60,kind,companions=[],hits,attack}={}){
 const r=dispatch(c,walk(c,place(exampleRun(c,'M',1),99,{level:20,xp:912,hp,mp:48,spells:{learned:[id],prepared:[id]},companions}),1).state,{type:'challengeKing'}).state;
 r.battle.enemy.hp=enemyHp;
 for(const x of [r.battle.current,r.battle.rounds.at(-1).enemyAction]){if(kind){x.kind=kind;if(kind==='反撃の隙') x.attack=0;} if(hits)x.hits=hits;if(attack)x.attack=attack;}
 const store=createMemoryStore();await store.startNew({run:r,meta:createMeta()});const s=createSession(c,store);await s.load();
 const before=structuredClone(s.view),effects=await s.act({type:'spell',spellId:id}),after=structuredClone(s.view);
 return {before,after,effects,store};
}
