// New overlay only: existing DK01 artwork is never edited or parsed at runtime.
// Coordinates follow the reviewed 300x304 dk01-p1/p2-idle crown; browser visual QA remains required.
export function createKingCrownRenderer({root,enemy,document,labels,getComputedStyle=globalThis.getComputedStyle}){
 if(!root||!enemy?.parentElement||!document?.createElementNS||!labels?.break||!labels?.next)throw TypeError('Missing crown renderer inputs');
 let overlay=null,banner=null,disposed=false;const animations=[];
 const animate=(node,frames,options)=>{if(node.animate)animations.push(node.animate(frames,options))};
 const svgNode=(tag,attrs)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n};
 return {
 crack({motion='none',durationMs=0}={}){
  if(disposed||overlay)return;
  const geometry=getComputedStyle(enemy);if(!geometry?.width||!geometry?.transform)throw Error('Missing crown geometry');
  overlay=svgNode('svg',{viewBox:'0 -1 300 304',width:300,height:304,'aria-hidden':'true'});
  Object.assign(overlay.style,{position:'absolute',left:enemy.style.left,top:enemy.style.top,width:geometry.width,height:'auto',transform:geometry.transform,pointerEvents:'none',overflow:'visible'});
  // Match .enemy layout via class; explicit anchor is the p1 idle metrics anchor.
  overlay.setAttribute('class','actor enemy king-crown-overlay');
  const crack=svgNode('path',{d:'M146 16L154 30L144 40L156 52L148 66M154 30L166 34M144 40L134 44',fill:'none',stroke:'#2A1E16','stroke-width':3,'stroke-linecap':'round','stroke-linejoin':'round',pathLength:1});
  const shard=svgNode('path',{d:'M154 30L166 34L160 43L154 39Z',fill:'#E3A41C',stroke:'#2A1E16','stroke-width':2});
  overlay.append(crack,shard);enemy.parentElement.append(overlay);
  if(motion!=='none'&&durationMs>0){animate(crack,[{strokeDasharray:'1',strokeDashoffset:1},{strokeDasharray:'1',strokeDashoffset:0}],{duration:durationMs>=500?500:durationMs,fill:'forwards',easing:'linear'});animate(shard,[{transform:'translate(0,0) rotate(0deg)',opacity:1},{transform:'translate(28px,48px) rotate(35deg)',opacity:0}],{duration:durationMs,fill:'forwards',easing:'ease-in'});}
  else shard.style.opacity='0';
 },
 banner({motion='none'}={}){
  if(disposed||banner)return;
  banner=document.createElement('div');banner.setAttribute('class','presentation-crown');banner.setAttribute('role','status');
  Object.assign(banner.style,{background:'#E3A41C',color:'#2A1E16',padding:'1.4rem 1rem .7rem',clipPath:'polygon(0 18%,18% 28%,25% 0,42% 22%,50% 0,58% 22%,75% 0,82% 28%,100% 18%,100% 100%,0 100%)'});
  for(const text of [labels.break,labels.next]){const p=document.createElement('p');p.textContent=text;banner.append(p)}root.append(banner);
  if(motion==='fade')animate(banner,[{opacity:0},{opacity:1}],{duration:300,fill:'forwards'});
 },
 dispose(){if(disposed)return;disposed=true;for(const a of animations)try{a.cancel()}catch{}overlay?.remove();banner?.remove();}
 };
}
