import test from 'node:test';import assert from 'node:assert/strict';import {auditTranslation} from '../src/locales/audit.js';
test('translation audit separates missing, stale, blank and placeholder damage',()=>{
 const r=auditTranslation({a:'あと{p0}回',b:'進む',c:'閉じる'},{a:'{p1} turns',b:' ',old:'Old'});
 assert.deepEqual(r.missing,['c']);assert.deepEqual(r.stale,['old']);assert.deepEqual(r.blank,['b']);assert.deepEqual(r.placeholderMismatch,['a']);assert.equal(r.valid,0);assert.equal(r.complete,false);
});
test('translation audit preserves repeated placeholders and distinguishes exact source',()=>{
 const r=auditTranslation({a:'{x}＋{x}',b:'王'},{a:'{x} plus {x}',b:'King'});assert.equal(r.complete,true);assert.equal(r.valid,2);
 assert.deepEqual(auditTranslation({a:'{x}＋{x}'},{a:'{x} plus'}).placeholderMismatch,['a']);
 assert.deepEqual(auditTranslation({a:'王'},{a:'王'}).sameAsSource,['a']);
});
test('empty optional original fields are explicit, not fabricated missing translations',()=>{
 const r=auditTranslation({a:'',b:'進む'},{b:'Continue'});assert.deepEqual(r.emptySource,['a']);assert.equal(r.required,1);assert.equal(r.complete,true);assert.deepEqual(r.missing,[]);
});
