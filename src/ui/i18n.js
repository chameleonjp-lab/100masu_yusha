import {uiTemplates} from '../locales/ui-templates.js';
import {catalogs} from '../locales/catalogs.js';
Object.assign(catalogs.ja,uiTemplates);
let activeLocale='ja';
export function setMessageLocale(locale){activeLocale=resolveLocale(locale,[])}
export function msg(key,params={}){return translate(activeLocale,key,params).text}
export const LOCALES=['ja','en','es','pt-BR','zh-Hans','fr','de','ko','ru','it','zh-Hant','id','tr','vi','th'];
export const LOCALE_NAMES=['日本語','English','Español','Português (Brasil)','简体中文','Français','Deutsch','한국어','Русский','Italiano','繁體中文','Bahasa Indonesia','Türkçe','Tiếng Việt','ไทย'];
function match(value){if(!value)return null;const v=String(value).toLowerCase();if(v.startsWith('zh'))return /tw|hk|mo|hant/.test(v)?'zh-Hant':'zh-Hans';if(v.startsWith('pt'))return 'pt-BR';return LOCALES.find(l=>l.toLowerCase()===v||l===v.split('-')[0])||null}
export function resolveLocale(saved,device=[]){return match(saved)||device.map(match).find(Boolean)||'en'}
export function translate(locale,key,params={}){const sourceLocale=[locale,'en','ja'].find(l=>typeof catalogs[l]?.[key]==='string');const raw=sourceLocale?catalogs[sourceLocale][key]:`[${key}]`;return {text:raw.replace(/\{(\w+)\}/g,(_,id)=>params[id]??`{${id}}`),translated:sourceLocale===locale,sourceLocale:sourceLocale||null,key};}
export function auditCatalog(locale,keys){const missing=keys.filter(k=>typeof catalogs[locale]?.[k]!=='string');return {locale,total:keys.length,translated:keys.length-missing.length,missing,complete:missing.length===0}}
export const UI_KEYS=['ui.settings','ui.language','ui.share','ui.shareDraft','ui.copy','ui.urlPending','ui.translationPending','ui.help','ui.records','ui.route','ui.homeIntro','ui.saved'];
export function contentKeys(content){const out=[];const walk=(v,path)=>{if(typeof v==='string'){if(/[\p{L}]/u.test(v)&&!/^#[\da-f]+$/i.test(v))out.push(path)}else if(v&&typeof v==='object')for(const[k,x]of Object.entries(v))if(!['id','refs','color','route','kind'].includes(k))walk(x,path?`${path}.${k}`:k)};for(const group of ['events','items','gear','spells','enemies','companions','jobs','routes'])walk(content[group],group);return out;}
export function shareDraft({locale='en',url,result=null}){let ready=false;try{const u=new URL(url);ready=u.protocol==='https:'&&!['localhost','127.0.0.1','::1'].includes(u.hostname)}catch{}const key=result?'share.result':'share.home';const text=translate(locale,key,{pos:result?.pos??0,rolls:result?.rolls??0,outcome:result?.defeated?translate(locale,'share.defeated').text:translate(locale,'share.reached').text}).text;return {ready,text:text+(ready?'\n'+url:''),reason:ready?null:'canonical_url_unconfirmed'};}
let sourceIndex=new Map();
export function installMessages(locale,messages){catalogs[locale]={...catalogs[locale],...messages};if(locale==='ja')sourceIndex=new Map(Object.entries(catalogs.ja).map(([key,text])=>[text,key]));}
export async function loadMessages(locale,fetcher=fetch){for(const code of [...new Set(['ja','en',locale])]){const response=await fetcher(new URL(`../locales/messages/${code}.json`,import.meta.url));if(!response.ok)throw Error(`locale_load_${code}`);installMessages(code,await response.json());}}
export function displayText(locale,text){if(typeof text!=='string')return text;const key=sourceIndex.get(text);return key?translate(locale,key).text:text;}
export function missingMessages(locale){const required=Object.keys(catalogs.ja).filter(key=>typeof catalogs.ja[key]==='string'&&catalogs.ja[key].trim());return auditCatalog(locale,required);}
const DISPLAY_FIELDS=new Set(['name','scene','action','result','effect','timing','limit','text','tell','response','summary','tradeoff','triggerText','line','label','title','prompt','description','reasonText']);
export function localizedContent(content,locale){const cache=new WeakMap();function wrap(obj,path=''){if(!obj||typeof obj!=='object')return obj;if(cache.has(obj))return cache.get(obj);const proxy=new Proxy(obj,{get(target,key){const value=target[key],id=path?`${path}.${String(key)}`:String(key);if(typeof value==='string'&&(DISPLAY_FIELDS.has(key)||/\.puzzle\.labels$/.test(path)||/\.puzzle\.display$/.test(path)&&key==='unit')){const hit=translate(locale,id);return hit.sourceLocale?hit.text:value}return value&&typeof value==='object'?wrap(value,id):value;}});cache.set(obj,proxy);return proxy}return wrap(content)}
// Bind only the engine's identified gear-receipt fields, never arbitrary text.
function localizeGearReceipt(source,out,content,locale){
 const prompt=source.prompt,gear=content.gear?.[prompt?.gearId];
 if(prompt?.kind!=='gearConfirm'||!gear||typeof gear.name!=='string'||!gear.name.trim()||prompt.gear?.id!==prompt.gearId||prompt.gear.name!==gear.name)return out;
 function message(key,params={}){
  const hit=translate(locale,key,params),template=catalogs[hit.sourceLocale]?.[key];
  if(typeof template!=='string'||!template.trim())return null;
  const placeholders=[...template.matchAll(/\{(\w+)\}/g)].map(x=>x[1]).sort();
  if(JSON.stringify(placeholders)!==JSON.stringify(Object.keys(params).sort())||/\{[^}]*\}/.test(hit.text))return null;
  return hit.text;
 }
 const titleKey='ui.receipt.gearTitle',confirmKey='ui.receipt.confirmGear';
 if(prompt.title===uiTemplates[titleKey].replace('{name}',gear.name)){
  const nameHit=translate(locale,`gear.${prompt.gearId}.name`);
  const name=nameHit.sourceLocale&&nameHit.text.trim()&&!/\{[^}]*\}/.test(nameHit.text)?nameHit.text:gear.name;
  out.prompt.title=message(titleKey,{name})??prompt.title;
 }
 for(const [index,action] of (source.actions||[]).entries()){
  if(action.type==='confirmGear'&&action.label===uiTemplates[confirmKey])out.actions[index].label=message(confirmKey)??action.label;
 }
 return out;
}
export function localizedView(view,content,locale){if(!view)return view;const prefix=view.event?.id?`scripts.events.${view.event.id}.`:null;function visit(value,sourcePath=null){if(Array.isArray(value))return value.map(x=>visit(x));if(!value||typeof value!=='object')return value;let path=sourcePath;if(value.id)for(const group of ['events','items','gear','spells','enemies','companions','jobs','routes'])if(content[group]?.[value.id]){path=`${group}.${value.id}`;break}const out={};for(const[k,v]of Object.entries(value)){if(k==='labels'&&v&&typeof v==='object'&&prefix){out[k]=Object.fromEntries(Object.entries(v).map(([id,label])=>{const key=prefix+'puzzle.labels.'+id;const hit=translate(locale,key);return[id,catalogs.ja[key]===label&&hit.sourceLocale?hit.text:label]}));continue}if(k==='option'&&value.kind==='underline'&&typeof v==='string'&&prefix){const key=prefix+'puzzle.cluePair.option',hit=translate(locale,key);out[k]=catalogs.ja[key]===v&&hit.sourceLocale?hit.text:v;continue}if(k==='unit'&&typeof v==='string'&&prefix){const key=prefix+'puzzle.display.unit',hit=translate(locale,key);out[k]=catalogs.ja[key]===v&&hit.sourceLocale?hit.text:v;continue}if(typeof v==='string'&&DISPLAY_FIELDS.has(k)){if(k==='reasonText'&&value.reason){const reason=translate(locale,'reasons.'+value.reason);if(reason.sourceLocale){out[k]=reason.text;continue}}const exact=path?translate(locale,`${path}.${k}`):null;if(exact?.sourceLocale&&catalogs.ja[`${path}.${k}`]===v){out[k]=exact.text;continue}const matches=prefix?Object.keys(catalogs.ja).filter(key=>key.startsWith(prefix)&&catalogs.ja[key]===v):[];const translated=matches.map(key=>translate(locale,key));out[k]=translated.length&&translated.every(x=>x.text===translated[0].text)?translated[0].text:v;}else out[k]=visit(v)}return out}return localizeGearReceipt(view,visit(view),content,locale)}
