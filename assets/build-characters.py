"""Adapt the repository's authored cut-paper construction into isolated game sprites.
No third-party artwork. Run from repo root. Mockup layouts are not shipped as game screens.
"""
import sys
import subprocess, json, math
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'docs/art/mockups/src'))
from pen import render
from common import icon_defs
from heroes import hero
import enemies
out=Path(__file__).resolve().parent/'characters'
out.mkdir(exist_ok=True)
sprites=[]
def write(name,fn,pose):
    content=f'<svg xmlns="http://www.w3.org/2000/svg" width="{fn.W}" height="{fn.H}" viewBox="0 0 {fn.W} {fn.H}" aria-hidden="true">'+render(fn,pose)+'</svg>'
    # MB03 uses the authored shared footprint icon; standalone SVGs need its definition.
    if 'href="#i-foot"' in content:
        foot = next(s for s in icon_defs().splitlines() if s.startswith('<symbol id="i-foot" '))
        content = content.replace('>', '><defs>' + foot + '</defs>', 1)
    if name.startswith('hero-') and pose=='attack':
        content=content.replace('M104 30C134 44 142 82 122 112C130 82 124 56 104 30Z', 'M138 38C156 54 161 76 150 96C153 75 148 55 138 38Z').replace('fill="#fff" stroke="#2A1E16" stroke-width="2"', 'fill="#fff" fill-opacity=".62" stroke="#E9C676" stroke-opacity=".6" stroke-width="1"')
    (out/(name+'.svg')).write_text(content,encoding='utf-8')
    sprites.append((name,fn.W,fn.H))
for outfit in ['traveler','warrior','mage','bard']:
 for pose in ['idle','walk1','walk2','attack','guard','cast','hit','victory','down']:
  write(f'hero-{outfit}-{pose}',hero(outfit,pose),pose)
for name in [f'en{i:02d}' for i in range(1,14)]+['mb01','mb02','mb03']:
 for pose in ['idle','attack','big','guard','open','hit']:
  write(f'{name}-{pose}',getattr(enemies,name)(pose),pose)
for pose in ['p1-idle','p1-attack','p1-big','p1-guard','p1-open','p2-idle','p2-attack','p2-big','p2-guard','p2-open']:
 write('dk01-'+pose,enemies.dk01(pose),pose)
# The old sheet's third role was provisional archer. Actual CP03 throws stones;
# adapt its cut-paper body, remove bow/quiver, and draw the correct hand/stone bag.
from heroes import companion
from pen import part
import xml.etree.ElementTree as ET
def stone_thrower(pose):
 def fn(pen,p):
  tree=ET.fromstring(companion('archer',pose)(pen,p))
  for parent in tree.iter():
   for child in list(parent):
    if child.get('data-part') in ('bow','quiver'): parent.remove(child)
  base=ET.tostring(tree,encoding='unicode').replace('data-part="archer"','data-part="thrower"')
  y=48 if p=='support' else 78
  stone=part('stone',pen.path(f'M69 {y}l7 -5 8 3 2 7 -7 5 -8 -3Z','#9CA9AA',2.2)+pen.circle(70,y+7,5,'#F6D2B0',2.2))
  bag=part('stone-bag',pen.path('M28 82Q17 92 22 111Q33 122 43 110L42 88Z','#A87547',2.5)+pen.line('M24 88L38 91',2))
  return base+bag+stone
 fn.W,fn.H=100,140
 return fn
for role in ['shield','medic','thrower','lantern']:
 for pose in ['idle','support']:
  write(f'comp-{role}-{pose}',stone_thrower(pose) if role=='thrower' else companion(role,pose),pose)

# Ink bounds include strokes/transforms. Preserve original center/ground and scale
# while providing six logical pixels of air around every pose's drawing.
def pad(entry):
 name,w,h=entry
 path=out/(name+'.svg')
 line=subprocess.check_output(['inkscape',str(path),'--query-all'],stderr=subprocess.DEVNULL,text=True).splitlines()[0]
 _,x,y,bw,bh=line.split(',');x,y,bw,bh=map(float,(x,y,bw,bh))
 left=min(0,math.floor(x-6));top=min(0,math.floor(y-6))
 right=max(w,math.ceil(x+bw+6));bottom=max(h,math.ceil(y+bh+6))
 nw,nh=right-left,bottom-top
 text=path.read_text().replace(f'width="{w}" height="{h}" viewBox="0 0 {w} {h}"',f'width="{nw}" height="{nh}" viewBox="{left} {top} {nw} {nh}"')
 path.write_text(text)
 ground=h-(8 if name.startswith('hero-') else 6 if name.startswith('comp-') else 14)
 return name,{'width':nw,'height':nh,'baseWidth':w,'anchorX':(w/2-left)/nw*100,'anchorY':(ground-top)/nh*100,'bounds':[x,y,bw,bh],'viewBox':[left,top,nw,nh]}
with ThreadPoolExecutor(max_workers=4) as pool: metrics=dict(pool.map(pad,sprites))
(out/'metrics.js').write_text('export const spriteMetrics='+json.dumps(metrics,separators=(',',':'))+';\n')
