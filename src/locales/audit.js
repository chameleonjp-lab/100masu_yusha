// Structural verification only. A complete result is not a linguistic acceptance.
const placeholders=s=>[...s.matchAll(/\{[A-Za-z_][A-Za-z0-9_]*\}/g)].map(x=>x[0]).sort();
export function auditTranslation(source,target){
 const out={total:Object.keys(source).length,provided:0,valid:0,required:0,emptySource:[],missing:[],stale:[],blank:[],placeholderMismatch:[],sameAsSource:[],complete:false};
 for(const key of Object.keys(target))if(!Object.hasOwn(source,key))out.stale.push(key);
 for(const [key,value] of Object.entries(source)){
  if(typeof value==='string'&&!value.trim()){out.emptySource.push(key);continue;}out.required++;
  if(!Object.hasOwn(target,key)){out.missing.push(key);continue;}out.provided++;
  const translated=target[key];if(typeof translated!=='string'||!translated.trim()){out.blank.push(key);continue;}
  if(JSON.stringify(placeholders(value))!==JSON.stringify(placeholders(translated))){out.placeholderMismatch.push(key);continue;}
  if(value===translated)out.sameAsSource.push(key);out.valid++;
 }
 out.complete=out.valid===out.required&&!out.stale.length;return out;
}
