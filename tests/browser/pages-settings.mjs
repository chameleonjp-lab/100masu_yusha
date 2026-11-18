// Test-only UI acceptance helper. Never modifies engine state or scores directly.
import assert from 'node:assert/strict';
export function collectPageErrors(page,errors){page.on('pageerror',()=>errors.push({kind:'pageerror'}));page.on('console',message=>{if(message.type()==='error')errors.push({kind:'console.error'})});}
export async function runSettingsPersistence({page,readSnapshot}){
 const before=await readSnapshot();assert.ok(before?.run?.runId,'Settings check requires saved route');assert.ok(before.meta?.settings);assert.ok(!before.meta.settings.language||before.meta.settings.language==='ja','Japanese UI required');
 const previous=before.meta.settings,animation=(previous.animation||'standard')==='standard'?'short':'standard';
 const expected=structuredClone(before.meta);expected.settings={...previous,language:previous.language||'ja',animation,reducedMotion:!!previous.reducedMotion,mute:!!previous.mute,masterVolume:previous.masterVolume??.8,bgmVolume:previous.bgmVolume??.5,seVolume:previous.seVolume??.8};
 await page.getByRole('button',{name:'設定',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'旅の設定',exact:true});await dialog.waitFor();
 const length=dialog.getByLabel('演出の長さ',{exact:true});assert.equal(await length.inputValue(),previous.animation||'standard');await length.selectOption(animation);
 await dialog.getByRole('button',{name:'設定を保存',exact:true}).click();await dialog.waitFor({state:'hidden'});
 const check=async()=>{const next=await readSnapshot();assert.deepEqual(next.run,before.run,'Settings changed saved run');assert.deepEqual(next.meta,expected,'Settings changed unrelated metadata');return next;};await check();
 await page.reload();await page.locator('#app').waitFor();await check();
 await page.getByRole('button',{name:'設定',exact:true}).click();await dialog.waitFor();assert.equal(await length.inputValue(),animation,'Reloaded UI lost setting');await dialog.getByRole('button',{name:'閉じる',exact:true}).click();await dialog.waitFor({state:'hidden'});await check();
 return {settingsPersisted:true,runUnchanged:true,otherMetadataUnchanged:true,animation,language:expected.settings.language};
}
