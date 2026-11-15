import {createRun,dispatch,applyRunToMeta,view} from '../engine/index.js';
export function createSession(content,store){
 let loaded=null, busy=false;
 const self={
  get run(){return loaded?.run}, get meta(){return loaded?.meta}, get status(){return loaded?.status},get busy(){return busy},
  get view(){return self.run?view(content,self.run):null},
  async load(){if(busy)throw new Error('busy');busy=true;try{loaded=await store.load();return loaded}finally{busy=false}},
  async start(route,confirmReplace=false){
   if(busy)throw new Error('busy'); busy=true;
   try{
    if(!loaded)loaded=await store.load();
    if(loaded.metaStatus==='unsupported')throw new Error('unsupported_record');
    const run=createRun(content,{route,runId:crypto.randomUUID(),seed:crypto.getRandomValues(new Uint32Array(1))[0]});
    await store.startNew({run,meta:loaded.meta,expectedMetaRevision:loaded.metaRevision,confirmReplace});
    loaded=await store.load(); return self.view;
   }finally{busy=false}
  },
  async act(action){
   if(busy)throw new Error('busy'); busy=true;
   try{
    const opId=crypto.randomUUID();
    const next=dispatch(content,loaded.run,{...action,opId});
    const meta=applyRunToMeta(loaded.meta,next.state).meta;
    meta.uiLastResult={runId:next.state.runId,revision:next.state.revision,effects:next.effects};
    await store.commit({run:next.state,meta,opId,expectedRevision:loaded.revision,expectedMetaRevision:loaded.metaRevision});
    loaded=await store.load();
    // Another tab may have moved on: never animate an outdated transaction.
    return loaded.run.runId===next.state.runId&&loaded.revision===next.state.revision?next.effects:[];
   }finally{busy=false}
  },
  async settings(settings){
   if(busy)throw new Error('busy'); busy=true;
   try{const meta={...loaded.meta,settings:{...loaded.meta.settings,...settings}};
    await store.saveMeta(meta,{expectedMetaRevision:loaded.metaRevision});loaded=await store.load();
   }finally{busy=false}
  }
 };return self;
}
