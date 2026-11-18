// Visual-only DOM overlay, never changes a game asset, state or reward choice.
export function createKingVictoryRenderer({root,enemy,document,label,getComputedStyle=globalThis.getComputedStyle}){
 if(!root||!enemy?.parentElement||!document||typeof label!=='string'||!label)throw TypeError('Missing victory renderer inputs');
 let disposed=false,started=false,smoke=null,text=null;const animations=[];
 const animate=(node,frames,opts)=>{if(node.animate)animations.push(node.animate(frames,opts))};
 return {
 disappear({motion='fade',durationMs=1000}={}){
  if(disposed||started)return;started=true;
  animate(enemy,[{opacity:1},{opacity:0}],{duration:durationMs,fill:'forwards',easing:'ease-out'});
  if(motion==='smoke'){
   const geometry=getComputedStyle(enemy);smoke=document.createElement('div');smoke.setAttribute('aria-hidden','true');
   Object.assign(smoke.style,{position:'absolute',left:enemy.style.left,top:enemy.style.top,width:geometry.width,height:geometry.width,transform:geometry.transform,pointerEvents:'none'});
   for(const [i,x] of [-18,0,18].entries()){
    const puff=document.createElement('span');Object.assign(puff.style,{display:'block',position:'absolute',left:`${20+i*15}%`,top:`${20+i*8}%`,width:'55%',height:'55%',borderRadius:'50%',background:'#B9B7C9'});smoke.append(puff);
    animate(puff,[{opacity:0,transform:'translate(0,0) scale(.4)'},{opacity:.75,offset:.3},{opacity:0,transform:`translate(${x}px,-32px) scale(1.2)`}],{duration:durationMs,fill:'forwards',easing:'ease-out'});
   }enemy.parentElement.append(smoke);
  }
 },
 label(){if(disposed||text)return;text=document.createElement('p');text.setAttribute('role','status');text.setAttribute('class','king-victory-label');text.textContent=label;root.append(text)},
 dispose(){if(disposed)return;disposed=true;for(const a of animations)try{a.cancel()}catch{}smoke?.remove();text?.remove()}
 };
}
