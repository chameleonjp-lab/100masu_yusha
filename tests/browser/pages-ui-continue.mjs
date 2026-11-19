// Prepared browser acceptance helper; Node doubles do not prove rendered UI or native storage.
import assert from 'node:assert/strict';
import {clickWithPhase} from './pages-settings.mjs';
export async function runUiContinue({page,before,readSnapshot}){
 assert.ok(before?.run?.runId,'Missing saved run');
 const {pos,revision,runId}=before.run;
 assert.ok(Number.isInteger(pos)&&pos>=1&&pos<=100,'Invalid saved position');
 assert.ok(Number.isSafeInteger(revision)&&revision>=0,'Invalid saved revision');
 assert.equal(before.view?.pos,pos,'Saved view position mismatch');
 assert.ok(Array.isArray(before.view.actions),'Missing saved actions');
 assert.deepEqual(await readSnapshot(),before,'Saved state changed before continue');
 const control=page.getByRole('button',{name:`${pos}マスから続きを遊ぶ`,exact:true});
 await control.waitFor();assert.equal(await control.isEnabled(),true,'Continue control disabled');await clickWithPhase('resume-game',()=>control.click());
 const chapter=page.getByRole('heading',{level:1,name:`${pos} / 100`,exact:true});await chapter.waitFor();
 assert.equal((await chapter.textContent()).trim(),`${pos} / 100`,'Wrong resumed position');
 assert.deepEqual(await readSnapshot(),before,'Saved state changed by continue');
 return {position:pos,runId,revision,uiContinue:true,savedStateUnchanged:true};
}
