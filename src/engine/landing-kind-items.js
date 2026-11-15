// BD37: three actual landings, not passed-over squares; settlement follows the third event.
import {fail} from './util.js';
import {changeHp,changeMp} from './core.js';
import {register} from './runner.js';
export function startLandingKinds(ctx){
 const s=ctx.s;
 if(s.phase!=='board'||s.hp<=0)fail('landing_tracker_not_now');
 if(s.flags.bd37)fail('landing_tracker_active');
 s.flags.bd37={kinds:[],settlePos:null};
}
export function recordLandingKind(ctx,pos,kind){
 const mark=ctx.s.flags.bd37;
 if(!mark || pos===1 || pos===100 || mark.settlePos!==null)return;
 if(mark.kinds.includes(kind)){delete ctx.s.flags.bd37;ctx.emit({t:'landingKindsFailed',kind});return;}
 mark.kinds.push(kind);
 if(mark.kinds.length===3)mark.settlePos=pos;
}
export function finishLandingKinds(ctx){
 const s=ctx.s,mark=s.flags.bd37;
 if(!mark || mark.settlePos!==s.pos)return;
 delete s.flags.bd37;
 if(s.hp<=0)return;
 changeHp(ctx,10,0,{reason:'BD37'});changeMp(ctx,4,0,{reason:'BD37'});
 ctx.emit({t:'landingKindsCompleted',kinds:mark.kinds});
}
register('trackLandingKinds',ctx=>startLandingKinds(ctx));
