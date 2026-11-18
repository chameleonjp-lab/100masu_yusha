// Test-only served response verification. Observations prove bytes, not browser behavior.
import {createHash} from 'node:crypto';
import {validateBase,makePolicy} from './pages-guard.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const mimeFor=p=>p.endsWith('.js')?['text/javascript','application/javascript']:p.endsWith('.json')?['application/json']:p.endsWith('.html')?['text/html']:p.endsWith('.css')?['text/css']:p.endsWith('.svg')?['image/svg+xml']:[];
export function servedVerifier(value,resources,manifestBytes){
 const base=validateBase(value),records=new Map(),seen=new Set();
 makePolicy(base.href,resources.map(r=>r.path));
 for(const r of resources){if(records.has(r.path)||!Number.isSafeInteger(r.bytes)||r.bytes<0||!/^[a-f0-9]{64}$/.test(r.sha256)||!mimeFor(r.path).length)throw Error('Invalid served resource record');records.set(r.path,{...r});}
 if(records.has('publication.json'))throw Error('Manifest must be separately pinned');
 records.set('publication.json',{path:'publication.json',bytes:manifestBytes.length,sha256:hash(manifestBytes)});
 const urls=new Map([...records].map(([p,r])=>[new URL(p,base).href,r]));if(records.has('index.html'))urls.set(base.href,records.get('index.html'));
 return {check(url,status,headers,body){const r=urls.get(url);if(!r)throw Error('Undeclared served URL');if(status!==200)throw Error('Unexpected served status');const mime=(headers['content-type']||'').split(';')[0].trim().toLowerCase();if(!mimeFor(r.path).includes(mime))throw Error('Unexpected served MIME');if(body.length!==r.bytes)throw Error('Served byte length mismatch');if(hash(body)!==r.sha256)throw Error('Served hash mismatch');seen.add(r.path);},observed(){return [...seen].sort();},missing(){return [...records.keys()].filter(p=>!seen.has(p)).sort();}};
}
