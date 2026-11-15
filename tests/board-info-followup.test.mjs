import test from 'node:test';
import assert from 'node:assert/strict';
import {getContent,exampleRun,place,withSquare} from './fixtures/helpers.mjs';
import {previewBoardItem} from '../src/engine/info-items.js';
const c=await getContent();
const helpers={enemyFor:id=>(c.events[id]?.refs||[]).find(id=>/^(EN|MB)/.test(id))};
test('BD03 only offers reachable battles before forced inn, without mutating state',()=>{
 let s=place(exampleRun(c),1);let ep=Object.values(c.events).find(e=>e.kind==='戦闘'&&e.refs.some(x=>/^EN/.test(x))).id;
 s=withSquare(s,2,ep);s=withSquare(s,7,ep);s.board.innPositions=[3];s.inns={3:{visited:false}};
 let before=JSON.stringify(s);let p=previewBoardItem(c,s,{id:'BD03',pos:2},helpers);assert.equal(p.square.pos,2);assert.ok(p.enemyName);assert.ok(p.firstAction);assert.equal(JSON.stringify(s),before);assert.throws(()=>previewBoardItem(c,s,{id:'BD03',pos:7},helpers));
});
test('BD47 selected kind stays in current band and requires targets',()=>{
 let s=place(exampleRun(c),18);let gear=Object.values(c.events).find(e=>e.kind==='装備').id;
 s=withSquare(s,19,gear);s=withSquare(s,21,gear);
 let p=previewBoardItem(c,s,{id:'BD47',kind:'装備'},helpers);assert.ok(p.squares.some(x=>x.pos===19));assert.ok(p.squares.every(x=>x.pos<=20));assert.throws(()=>previewBoardItem(c,s,{id:'BD47',kind:'戦闘'},helpers));
});
test('BD15 names at most two existing candidates and does not draw or receive',()=>{
 let s=place(exampleRun(c),1);let e=Object.values(c.events).find(e=>e.kind==='装備'&&e.refs.some(id=>c.gear[id]));s=withSquare(s,8,e.id);
 const before=JSON.stringify(s);const p=previewBoardItem(c,s,{id:'BD15',pos:8},helpers);assert.ok(p.candidates.length>0&&p.candidates.length<=2);assert.equal(JSON.stringify(s),before);assert.throws(()=>previewBoardItem(c,s,{id:'BD15',pos:12},helpers));
});
import {dispatch} from '../src/engine/index.js';
import {withScripts} from './fixtures/helpers.mjs';
test('boardItem dispatch requires a target before consuming and records selected information',()=>{
 const custom=withScripts(c,{items:{BD03:{uses:[{where:['board'],effects:[{op:'boardItem',id:'BD03'}]}]}}});
 let s=place(exampleRun(custom),1);s.bag.push('BD03');let ep=Object.values(c.events).find(e=>e.kind==='戦闘'&&e.refs.some(x=>/^EN/.test(x))).id;s=withSquare(s,2,ep);
 const r=dispatch(custom,s,{type:'useItem',itemId:'BD03',params:{pos:2}});assert.equal(r.state.reveals.at(-1).data.square.pos,2);assert.equal(r.state.bag.filter(x=>x==='BD03').length,0);
 assert.throws(()=>dispatch(custom,s,{type:'useItem',itemId:'BD03',params:{pos:99}}));assert.ok(s.bag.includes('BD03'));
});
test('BD24 reads actual optional reward values',()=>{let s=place(exampleRun(c),1);let e=Object.values(c.events).find(e=>e.refs.includes('MB01'));s=withSquare(s,4,e.id);const p=previewBoardItem(c,s,{id:'BD24'},helpers);assert.equal(p.reward.gold,600);assert.equal(p.reward.xp,50);});
import {walk} from './fixtures/helpers.mjs';
import {tickInfoMarks} from '../src/engine/info-items.js';
test('BD10 creates only a selected-square first-normal reservation and expires on a different landing',()=>{
 const custom=withScripts(c,{items:{BD10:{uses:[{where:['board'],effects:[{op:'boardItem',id:'BD10'}]}]}}});
 let s=place(exampleRun(custom),1);s.bag.push('BD10');let ep=Object.values(c.events).find(e=>e.kind==='戦闘'&&e.refs.some(x=>/^EN/.test(x))).id;s=withSquare(s,2,ep);
 s=dispatch(custom,s,{type:'useItem',itemId:'BD10',params:{pos:2}}).state;
 assert.equal(s.reservations.at(-1).pos,2);assert.equal(s.reservations.at(-1).effects[0].rules[0].effects[0].amount,6);
 s.reservations[0].movesUsed=1;tickInfoMarks(custom,s,3);assert.equal(s.reservations.length,0);
});
test('BD15 marks survive target arrival but not passing; BD47 marks expire on band exit',()=>{
 let s=place(exampleRun(c),1);s.reveals=[{untilPassed:3},{untilBand:1}];tickInfoMarks(c,s,3);assert.equal(s.reveals.length,2);tickInfoMarks(c,s,4);assert.equal(s.reveals.length,1);tickInfoMarks(c,s,21);assert.equal(s.reveals.length,0);
});
test('BD13 preview computes current capped resources without payment or RNG changes',()=>{
 const custom=withScripts(c,{events:{'M1-30':{options:[{id:'a',label:'比較',cost:{gold:10},effects:[{op:'hp',delta:5},{op:'mp',delta:-2}]}]}}});
 let s=place(exampleRun(custom),1);const id=Object.values(custom.events).find(e=>e.kind==='選択').id;
 custom.scripts.events[id]=custom.scripts.events['M1-30'];s=withSquare(s,2,id);s.hp=20;s.mp=5;const before=JSON.stringify(s);
 const p=previewBoardItem(custom,s,{id:'BD13',pos:2});assert.equal(p.options[0].gold,-10);assert.equal(p.options[0].mp,-2);assert.equal(p.options[0].hp,5);assert.equal(JSON.stringify(s),before);
});
test('BD10 reaches the selected battle and transfers its one-shot mark',()=>{
 const ep=Object.values(c.events).find(e=>e.kind==='戦闘'&&e.refs.includes('EN01')).id;
 const custom=withScripts(c,{events:{[ep]:{onLand:[{op:'battle',enemy:'EN01'}]}},items:{BD10:{uses:[{where:['board'],effects:[{op:'boardItem',id:'BD10'}]}]}}});
 let s=place(exampleRun(custom),1);s.bag.push('BD10');s=withSquare(s,2,ep);s.board.innPositions=[10];s.inns={10:{visited:false}};
 s=dispatch(custom,s,{type:'useItem',itemId:'BD10',params:{pos:2}}).state;
 s=walk(custom,s,1).state;assert.equal(s.phase,'battle');assert.ok(s.battle.marks.some(m=>m.id==='BD10'));assert.ok(!s.reservations.some(r=>r.slot==='arrival'));
 const result=dispatch(custom,s,{type:'attack'});assert.ok(result.effects.some(f=>f.t==='hit'&&f.target==='enemy'));
});

test('BD15 excludes payment items and lists actual authored rewards',()=>{let s=withSquare(place(exampleRun(c,'F'),1),2,'F3-33');let p=previewBoardItem(c,s,{id:'BD15',pos:2});assert.deepEqual(p.candidates.map(x=>x.id),['AT24','BD24']);});
test('BD13 handles award origin and unrolled die alternatives',()=>{
 let s=withSquare(place(exampleRun(c),1),2,'M1-42');assert.equal(previewBoardItem(c,s,{id:'BD13',pos:2}).options[0].gold,150);
 s=withSquare(s,2,'B2-48');let p=previewBoardItem(c,s,{id:'BD13',pos:2});assert.deepEqual(p.options[1].outcomes.map(x=>x.hp),[-2,-2,-2,-4,-4,-4]);
});
test('BD03 reads the authored initial scenario telegraph',()=>{let s=withSquare(place(exampleRun(c,'B'),1),2,'B1-16');s.board.innPositions=[10];s.inns={10:{visited:false}};assert.equal(previewBoardItem(c,s,{id:'BD03',pos:2}).firstAction.name,'二段突き');});
test('BD13 enumerates authored numeric choices and nested alternatives',()=>{
 let s=withSquare(place(exampleRun(c,'B'),1),2,'B4-37');s.hp=10;s.mp=0;
 let p=previewBoardItem(c,s,{id:'BD13',pos:2});assert.deepEqual(p.options[0].variants.map(x=>[x.input,x.hp,x.mp]),[[0,0,6],[1,3,4],[2,6,2],[3,9,0]]);
 s=withSquare(s,2,'B2-44');p=previewBoardItem(c,s,{id:'BD13',pos:2});assert.equal(p.options[1].choices.find(x=>x.id==='heal').hp,6);
});
test('BD10 does not postpone its first-normal bonus when the first attack is immune',()=>{
 const ep=Object.values(c.events).find(e=>e.kind==='戦闘'&&e.refs.includes('EN01')).id;const custom=withScripts(c,{events:{[ep]:{onLand:[{op:'battle',enemy:'EN01'}]}}});
 let s=withSquare(place(exampleRun(custom),1,{bag:['BD10']}),2,ep);s.board.innPositions=[10];s.inns={10:{visited:false}};s=dispatch(custom,s,{type:'useItem',itemId:'BD10',params:{pos:2}}).state;s=walk(custom,s,1).state;s.battle.enemy.hp=200;s.battle.enemy.maxHp=200;s.hp=100;s.battle.current.immune=true;
 s=dispatch(custom,s,{type:'attack'}).state;s.battle.current.immune=false;let r=dispatch(custom,s,{type:'attack'});assert.ok(!r.effects.some(f=>f.t==='rule'&&f.id==='BD10'));
});
