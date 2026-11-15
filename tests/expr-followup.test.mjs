import test from 'node:test';
import assert from 'node:assert/strict';
import { evalExpr } from '../src/engine/expr.js';
test('itemCount resolves selected item variables as well as literal IDs without mutations',()=>{
 const env={ctx:{s:{bag:['HE01','HE01','BD01']},content:{}},vars:{item:'HE01'}};
 assert.equal(evalExpr(env,{ref:'itemCount',id:{ref:'var.item'}}),2);
 assert.equal(evalExpr(env,{ref:'itemCount',id:'BD01'}),1);
 assert.deepEqual(env.ctx.s.bag,['HE01','HE01','BD01']);
});
test('equipped armor and enemy round facts do not confuse ownership or non-attacking rounds',()=>{
 const env={ctx:{content:{},s:{gear:[{iid:'armor',id:'AR01'}],equipped:{armor:null},battle:{round:2,rounds:[{enemyHit:false,hpAfterEnemy:9}]}}}};
 assert.equal(evalExpr(env,{ref:'hasEquippedArmor'}),false);
 env.ctx.s.equipped.armor='armor';assert.equal(evalExpr(env,{ref:'hasEquippedArmor'}),true);
 assert.equal(evalExpr(env,{ref:'battle.enemyHit',offset:-1}),false);
 assert.equal(evalExpr(env,{ref:'battle.hpAfterEnemy',offset:-1}),9);
});
