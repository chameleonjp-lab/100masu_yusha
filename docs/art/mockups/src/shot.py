"""Validate SVG as strict XML, then screenshot with headless Chrome.
usage: python3 shot.py file.svg out.png [scale]
"""
import subprocess
import sys
import xml.etree.ElementTree as ET

svg, png = sys.argv[1], sys.argv[2]
scale = sys.argv[3] if len(sys.argv) > 3 else '1'
root = ET.parse(svg).getroot()
vb = root.get('viewBox').split()
w, h = int(float(vb[2])), int(float(vb[3]))
cmd = ['google-chrome', '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
       f'--force-device-scale-factor={scale}', f'--screenshot={png}', f'--window-size={w},{h}', f'file://{svg}']
r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
print('ok', png, w, h)
