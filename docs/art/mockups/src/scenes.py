"""Scenery, tiles, telegraph tags and other mockup parts (option A unless noted)."""
import math
from common import P, KIND, text, rect, use, tw, die_face, esc

INK = P['ink']
NO_START = '、。」）！？ー'


def wrap(s, size, width):
    """Greedy Japanese wrap by estimated width; avoid starting a line with closing punctuation."""
    lines, cur = [], ''
    for ch in s:
        if tw(cur + ch, size) > width and cur:
            if ch in NO_START:
                cur += ch
                continue
            lines.append(cur)
            cur = ch
        else:
            cur += ch
    if cur:
        lines.append(cur)
    return lines


def smooth(points, tension=0.5):
    """Catmull-Rom spline through points -> cubic Bezier path data."""
    d = f'M{points[0][0]:.1f} {points[0][1]:.1f}'
    for i in range(len(points) - 1):
        p0 = points[i - 1] if i > 0 else points[i]
        p1, p2 = points[i], points[i + 1]
        p3 = points[i + 2] if i + 2 < len(points) else p2
        c1 = (p1[0] + (p2[0] - p0[0]) * tension / 3, p1[1] + (p2[1] - p0[1]) * tension / 3)
        c2 = (p2[0] - (p3[0] - p1[0]) * tension / 3, p2[1] - (p3[1] - p1[1]) * tension / 3)
        d += f'C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}'
    return d


# ---------------------------------------------------------------- props
def castle(cx, base_y, scale, color='#8E9DB0', windows=False, outline=False):
    """Castle silhouette, 160x160 design, anchored at bottom-centre."""
    st = f' stroke="{INK}" stroke-width="{2.5 / scale:.1f}" stroke-linejoin="round"' if outline else ''
    win = ''
    if windows:
        win = ''.join(f'<rect x="{x}" y="{y}" width="8" height="12" rx="4" fill="#F4C35A"/>' for x, y in
                      [(46, 70), (106, 70), (76, 52), (76, 96), (30, 104), (122, 104)])
    return (f'<g transform="translate({cx - 80 * scale:.1f} {base_y - 160 * scale:.1f}) scale({scale})">'
            f'<path d="M14 160V92h14V80h10v12h12V60h-6V44h10V32h8v12h10V24h-4L80 4l12 20h-4v20h10V32h8v12h10v16h-6v32h12V80h10v12h14v68Z" fill="{color}"{st}/>'
            f'<path d="M80 4V-12l16 6-16 6" fill="{P["tell-big"]}"{st}/>'
            f'<path d="M66 160v-30a14 14 0 0 1 28 0v30Z" fill="rgba(0,0,0,.28)"/>{win}</g>')


def tree(x, y, r, c='#7FAE55', line=True):
    st = f' stroke="{INK}" stroke-width="1.5" stroke-opacity=".5"' if line else ''
    return (f'<rect x="{x - 3}" y="{y}" width="6" height="{r * .9:.0f}" fill="#7A5A3C"{st}/>'
            f'<circle cx="{x}" cy="{y - r * .2:.1f}" r="{r}" fill="{c}"{st}/>')


def windmill(x, y, s=1.0):
    return (f'<g transform="translate({x} {y}) scale({s})" stroke="{INK}" stroke-width="1.5" stroke-opacity=".55" stroke-linejoin="round">'
            f'<path d="M-9 36L-6 0H6L9 36Z" fill="#E8D6B0"/><path d="M-10 0L0 -9L10 0Z" fill="#B5583A"/>'
            f'<g transform="rotate(20 0 -2)"><path d="M0 -2L-3 -30L3 -30Z M0 -2L28 -5L28 1Z M0 -2L3 26L-3 26Z M0 -2L-28 1L-28 -5Z" fill="#F3E3C3"/></g>'
            f'<circle cx="0" cy="-2" r="2.5" fill="{INK}"/></g>')


def stall(x, y):
    """Market stall (M route roadside prop). Anchor top-left."""
    stripes = ''.join(f'<path d="M{x + 4 + i * 12} {y + 14}h12v14q-6 6-12 0z" fill="{"#C8473A" if i % 2 == 0 else "#FFF6E6"}" stroke="{INK}" stroke-width="2"/>' for i in range(6))
    return (f'<g class="prop-stall">'
            f'<rect x="{x + 8}" y="{y + 26}" width="4" height="40" fill="#8A5A2B" stroke="{INK}" stroke-width="2"/>'
            f'<rect x="{x + 66}" y="{y + 26}" width="4" height="40" fill="#8A5A2B" stroke="{INK}" stroke-width="2"/>'
            f'<rect x="{x}" y="{y + 6}" width="80" height="10" rx="3" fill="#B5583A" stroke="{INK}" stroke-width="2"/>{stripes}'
            f'<rect x="{x + 2}" y="{y + 50}" width="76" height="20" rx="3" fill="#C98E52" stroke="{INK}" stroke-width="2.5"/>'
            f'<circle cx="{x + 22}" cy="{y + 46}" r="6" fill="#E9877A" stroke="{INK}" stroke-width="2"/>'
            f'<circle cx="{x + 36}" cy="{y + 46}" r="6" fill="#F2D24B" stroke="{INK}" stroke-width="2"/>'
            f'<rect x="{x + 48}" y="{y + 38}" width="22" height="14" rx="2" fill="#D3AE7B" stroke="{INK}" stroke-width="2"/>'
            f'<rect x="{x + 54}" y="{y + 28}" width="16" height="10" rx="2" fill="#fff" stroke="{INK}" stroke-width="1.6"/>'
            + text(x + 62, y + 36.5, '30G', 7, 800, INK, 'middle') + '</g>')


def signpost(x, y, route, h=64):
    """Route signpost: pole + board with the route motif. Anchor = foot of the pole."""
    return (f'<g class="signpost-{route}"><rect x="{x - 3}" y="{y - h}" width="6" height="{h}" rx="2" fill="#8A5A2B" stroke="{INK}" stroke-width="2"/>'
            f'<rect x="{x - 24}" y="{y - h - 10}" width="48" height="40" rx="8" fill="{P["route-" + route]}" stroke="{INK}" stroke-width="2.5"/>'
            f'<rect x="{x - 24}" y="{y - h - 10}" width="48" height="40" rx="8" fill="url(#pat-{route})"/>'
            f'<circle cx="{x}" cy="{y - h + 10}" r="15" fill="{P["cut"]}" stroke="{INK}" stroke-width="2"/>'
            + use(f'r-{route}', x - 12, y - h - 2, 24) + '</g>')


def grass_tufts(pts, c='#6E9C47'):
    return ''.join(f'<path d="M{x - 5} {y}l3 -8 2 8 3 -10 2 10 3 -7 2 7" fill="none" stroke="{c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' for x, y in pts)


def flowers(pts):
    out = []
    for i, (x, y) in enumerate(pts):
        c = '#F2D24B' if i % 2 == 0 else '#E9877A'
        out.append(f'<circle cx="{x}" cy="{y}" r="3.2" fill="{c}" stroke="{INK}" stroke-width="1.2"/>')
    return ''.join(out)


# ---------------------------------------------------------------- board tiles
def tile(cx, cy, size, kind, step=None, faded=False, treasure=False, ring=False, inn_flag=False, label=None):
    fillkey, icon = KIND[kind]
    s = size
    x, y = cx - s / 2, cy - s / 2
    op = ' opacity="0.45"' if faded else ''
    dash = ' stroke-dasharray="5 4"' if faded else ''
    o = [f'<g class="tile tile-{kind}"{op}>']
    o.append(rect(x, y + 3, s, s, s * .18, fill='rgba(42,30,22,.25)'))
    o.append(f'<rect x="{x}" y="{y}" width="{s}" height="{s}" rx="{s * .18:.1f}" fill="{P[fillkey]}" stroke="{INK}" stroke-width="2.5"{dash}/>')
    if kind == '宿場':
        o.append(f'<path d="M{x - 6} {y + s * .32}L{cx} {y - s * .28}L{x + s + 6} {y + s * .32}Z" fill="#B5583A" stroke="{INK}" stroke-width="2.5" stroke-linejoin="round"/>')
        o.append(rect(cx - s * .16, y + s * .45, s * .32, s * .28, 3, fill='#FFE27A', stroke=INK, sw=2))
        o.append(f'<path d="M{cx} {y + s * .45}V{y + s * .73}M{cx - s * .16} {y + s * .59}H{cx + s * .16}" stroke="{INK}" stroke-width="1.6"/>')
    else:
        isz = s * .62
        o.append(use(icon, cx - isz / 2, cy - isz / 2, isz))
    if step is not None and not faded:
        ds = 22 if s >= 56 else 18
        o.append(die_face(x - ds * .35, y - ds * .35, ds, step))
    if treasure:
        o.append(use('i-chest', x + s - 14, y - 10, 24))
    if ring:
        o.append(f'<circle cx="{cx}" cy="{cy}" r="{s * .78:.1f}" fill="none" stroke="{P["act-edge"]}" stroke-width="4" stroke-dasharray="9 6"/>')
    if inn_flag:
        fx, fy = x + s + 2, y - s * .2
        o.append(f'<path d="M{fx} {fy + 46}V{fy}" stroke="{INK}" stroke-width="3" stroke-linecap="round"/>'
                 f'<path d="M{fx} {fy}h46l-8 10 8 10h-46z" fill="#B5583A" stroke="{INK}" stroke-width="2" stroke-linejoin="round"/>'
                 + text(fx + 20, fy + 14.5, 'とまる', 12, 800, P['cut'], 'middle'))
    if label:
        o.append(label)
    o.append('</g>')
    return ''.join(o)


def strip_card(x, y, w, h, step, kind, faded=False, emph=False, ring=False):
    fillkey, icon = KIND[kind]
    op = ' opacity="0.45"' if faded else ''
    dash = ' stroke-dasharray="5 4"' if faded else ''
    sw = 3 if emph else 2
    o = [f'<g class="strip-card"{op}>', rect(x, y + 3, w, h, 10, fill='rgba(42,30,22,.22)'),
         f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{P["paper-card"]}" stroke="{INK}" stroke-width="{sw}"{dash}/>',
         f'<path d="M{x + 1} {y + 10}a9 9 0 0 1 9 -9h{w - 20}a9 9 0 0 1 9 9v2h-{w - 2}z" fill="{P[fillkey]}"/>',
         die_face(x + w / 2 - 9, y + 6, 18, step),
         use(icon, x + w / 2 - 13, y + 27, 26),
         text(x + w / 2, y + h - 7, kind, 13, 800, INK, 'middle')]
    if ring:
        o.append(f'<rect x="{x - 5}" y="{y - 5}" width="{w + 10}" height="{h + 10}" rx="14" fill="none" stroke="{P["act-edge"]}" stroke-width="4" stroke-dasharray="9 6"/>')
    o.append('</g>')
    return ''.join(o)


# ---------------------------------------------------------------- telegraph tag (4 shapes, see doc 4.2)
TELL = {
    '通常攻撃': dict(word='攻撃', icon='t-attack', bg=P['tell-attack-bg'], band=P['tell-attack'], hint='ふつうの攻撃が来る'),
    '大技': dict(word='大技', icon='t-big', bg=P['tell-big'], band=P['tell-big'], hint='強い一撃が来る。防御で軽くできる'),
    '守り': dict(word='守り', icon='t-guard', bg=P['tell-guard-bg'], band=P['tell-guard'], hint='この手は攻撃しない。今はかたい'),
    '反撃の隙': dict(word='すき', icon='t-open', bg=P['tell-open-bg'], band=P['tell-open'], hint='攻撃は来ない。攻めどき'),
}


def tag_frame(kind, w, h):
    if kind == '通常攻撃':
        return f'M12 0H{w - 12}Q{w} 0 {w} 12V{h - 12}Q{w} {h} {w - 12} {h}H12Q0 {h} 0 {h - 12}V12Q0 0 12 0Z'
    if kind == '大技':
        n = max(1, round(w / 16))
        tw_ = w / n
        top = 'M0 8' + ''.join(f'L{i * tw_ + tw_ / 2:.1f} 0L{(i + 1) * tw_:.1f} 8' for i in range(n))
        bot = f'L{w} {h - 8}' + ''.join(f'L{w - i * tw_ - tw_ / 2:.1f} {h}L{w - (i + 1) * tw_:.1f} {h - 8}' for i in range(n))
        return top + bot + 'Z'
    if kind == '守り':
        return f'M0 10Q0 0 10 0H{w - 10}Q{w} 0 {w} 10V{h - 22}L{w / 2} {h}L0 {h - 22}Z'
    # 反撃の隙: ticket with semicircle notches
    return (f'M16 0H{w - 16}A16 16 0 0 1 {w} 16V{h / 2 - 10}A10 10 0 0 0 {w} {h / 2 + 10}V{h - 16}'
            f'A16 16 0 0 1 {w - 16} {h}H16A16 16 0 0 1 0 {h - 16}V{h / 2 + 10}A10 10 0 0 0 0 {h / 2 - 10}V16A16 16 0 0 1 16 0Z')


def telegraph_tag(x, y, w, kind, name, tell, atk, dfn, string_top=None):
    """Returns (svg, height). Contents: header(icon+word) / action name / tell / numbers / hint."""
    t = TELL[kind]
    pad = 12
    inner = w - pad * 2 - (8 if kind == '大技' else 0)
    nl = wrap(name, 20, inner)
    tl = wrap(tell, 16, inner)
    hint_l = wrap(t['hint'], 14, w - pad * 2 - (8 if kind == '大技' else 0))
    head = 40
    body_h = 30 + (len(nl) - 1) * 24 + len(tl) * 23 + 34 + len(hint_l) * 19 + 20
    h = head + body_h + (24 if kind == '守り' else 14)
    o = [f'<g class="telegraph-tag tell-{kind}">']
    if string_top is not None:
        o.append(f'<path d="M{x + w / 2} {string_top}V{y + 4}" stroke="{INK}" stroke-width="2"/>'
                 f'<circle cx="{x + w / 2}" cy="{y + 4}" r="4" fill="{P["wood"]}" stroke="{INK}" stroke-width="2"/>')
    frame = tag_frame(kind, w, h)
    o.append(f'<path transform="translate({x} {y + 3})" d="{frame}" fill="rgba(42,30,22,.25)"/>')
    sw = 3 if kind == '大技' else 2
    o.append(f'<path transform="translate({x} {y})" d="{frame}" fill="{t["bg"]}" stroke="{INK}" stroke-width="{sw}" stroke-linejoin="round"/>')
    # header band
    if kind != '大技':
        o.append(f'<path transform="translate({x} {y})" d="M{(16 if kind == "反撃の隙" else 10)} 0H{w - (16 if kind == "反撃の隙" else 10)}Q{w} 0 {w} 12V14H0V12Q0 0 {(16 if kind == "反撃の隙" else 10)} 0Z" fill="{t["band"]}" opacity=".9"/>')
    word_c = P['cut'] if kind == '大技' else INK
    o.append(use(t['icon'], x + pad, y + 13 + (2 if kind == '大技' else 0), 28))
    o.append(text(x + pad + 34, y + 36 + (2 if kind == '大技' else 0), t['word'], 21, 900, word_c))
    by = y + head + 6
    if kind == '大技':   # inner cream board keeps text on paper
        o.append(rect(x + 8, by - 2, w - 16, body_h - 4, 8, fill=P['paper-card'], stroke=INK, sw=2))
    ix = x + pad + (4 if kind == '大技' else 0)
    for i, ln in enumerate(nl):
        o.append(text(ix, by + 22 + i * 24, ln, 20, 800, INK))
    ty = by + 30 + (len(nl) - 1) * 24
    for i, ln in enumerate(tl):
        o.append(text(ix, ty + 17 + i * 23, ln, 16, 400, INK))
    cy = ty + len(tl) * 23 + 6
    a_lbl = f'攻撃 {atk}' if atk else '攻撃 なし'
    cw1 = tw(a_lbl, 14) + 34
    o.append(rect(ix, cy, cw1, 26, 13, fill='#fff', stroke=INK, sw=1.6) + use('i-sword', ix + 4, cy + 4, 18)
             + text(ix + 26, cy + 18, a_lbl, 14, 800, INK))
    d_lbl = f'防御 {dfn}'
    o.append(rect(ix + cw1 + 6, cy, tw(d_lbl, 14) + 34, 26, 13, fill='#fff', stroke=INK, sw=1.6) + use('i-shield', ix + cw1 + 10, cy + 4, 18)
             + text(ix + cw1 + 32, cy + 18, d_lbl, 14, 800, INK))
    hy = cy + 34
    for i, ln in enumerate(hint_l):
        o.append(text(ix, hy + 14 + i * 19, ln, 14, 800, P['tell-big'] if kind == '大技' else P['ink-2']))
    o.append('</g>')
    return '\n'.join(o), h


def danger_shadow(cx, cy, rx, ry):
    return (f'<g class="telegraph-shadow"><ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="url(#hatch-red)"/>'
            f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="none" stroke="{P["tell-big"]}" stroke-width="2.5" stroke-dasharray="8 5"/>'
            + use('t-big', cx + rx - 12, cy - ry - 14, 26) + '</g>')


# ---------------------------------------------------------------- backdrops
def board_scene_band1(x0, y0, w, h):
    """Band 1 morning grassland, M route. Returns svg (clipped to the scene box)."""
    o = [f'<defs><clipPath id="scene-clip"><rect x="{x0}" y="{y0}" width="{w}" height="{h}"/></clipPath>'
         f'<linearGradient id="sky1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#CFE8F2"/><stop offset="1" stop-color="#F3EBCB"/></linearGradient></defs>',
         f'<g clip-path="url(#scene-clip)">',
         rect(x0, y0, w, 200, fill='url(#sky1)'),
         f'<circle cx="62" cy="{y0 + 44}" r="20" fill="#FFF6D8"/>',
         castle(232, y0 + 92, 0.22),
         f'<path d="M0 {y0 + 98}Q60 {y0 + 74} 130 {y0 + 90}T262 {y0 + 84}T402 {y0 + 88}V{y0 + 140}H0Z" fill="#B9D49A"/>',
         f'<path d="M0 {y0 + 134}Q80 {y0 + 104} 170 {y0 + 126}T330 {y0 + 118}T402 {y0 + 124}V{y0 + 200}H0Z" fill="#98C46E" stroke="{INK}" stroke-width="1.5" stroke-opacity=".5"/>',
         windmill(352, y0 + 96, .9), tree(36, y0 + 128, 16), tree(78, y0 + 120, 12, '#8DBB62'),
         rect(0, y0 + 160, w, h - 160, fill='#A7CF78'),
         f'<path d="M0 {y0 + 162}Q100 {y0 + 150} 200 {y0 + 160}T402 {y0 + 158}" fill="none" stroke="{INK}" stroke-width="2" stroke-opacity=".6"/>']
    return o


def mine_backdrop(x0, y0, w, h):
    """Band 3 mine-pass battle backdrop."""
    gy = y0 + h - 64
    return (f'<defs><clipPath id="stage-clip"><rect x="{x0}" y="{y0}" width="{w}" height="{h}"/></clipPath>'
            f'<linearGradient id="rock" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7E6C5A"/><stop offset="1" stop-color="#A08B74"/></linearGradient></defs>'
            f'<g clip-path="url(#stage-clip)">'
            + rect(x0, y0, w, h, fill='url(#rock)')
            + f'<path d="M0 {y0 + 60}l40 -20 30 14 46 -26 40 22 50 -18 44 26 60 -20 50 16 42 -12V{y0}H0Z" fill="#6B5B4B" opacity=".55"/>'
            + f'<path d="M60 {y0 + 120}l20 10-6 18M300 {y0 + 90}l-14 16 10 14M200 {y0 + 160}l16 8" stroke="#5A4A3C" stroke-width="2" fill="none" opacity=".7"/>'
            + rect(x0 + 20, y0, 18, h - 60, 3, fill='#7A5A3C', stroke=INK, sw=2.5)
            + rect(x0 + w - 38, y0, 18, h - 60, 3, fill='#7A5A3C', stroke=INK, sw=2.5)
            + rect(x0, y0 + 14, w, 18, 3, fill='#8A6A48', stroke=INK, sw=2.5)
            + f'<path d="M150 {y0 + 32}V{y0 + 50}" stroke="{INK}" stroke-width="2"/>'
            + f'<circle cx="150" cy="{y0 + 66}" r="26" fill="rgba(255,226,122,.30)"/>'
            + rect(141, y0 + 50, 18, 22, 4, fill='#FBE7A6', stroke=INK, sw=2)
            + f'<path d="M150 {y0 + 69}c-3 0-4-2-4-4 0-3 4-5 4-8 1 3 4 5 4 8 0 2-1 4-4 4z" fill="#F29A3A"/>'
            + rect(x0, gy, w, 64, fill='#A08566')
            + f'<path d="M0 {gy}H{w}" stroke="{INK}" stroke-width="2.5"/>'
            + f'<path d="M0 {gy + 40}L{w} {gy + 26}M0 {gy + 56}L{w} {gy + 42}" stroke="#5E6A74" stroke-width="4"/>'
            + ''.join(f'<path d="M{20 + i * 46} {gy + 30 - i * 1.2}l6 32" stroke="#6B4F35" stroke-width="5"/>' for i in range(9))
            + ''.join(f'<ellipse cx="{x}" cy="{y}" rx="{r}" ry="{r * .6:.1f}" fill="#8C7A66" stroke="{INK}" stroke-width="1.5"/>' for x, y, r in
                      [(30, gy + 12, 7), (360, gy + 8, 5), (250, gy + 14, 4), (90, gy + 6, 4)]))
    # NOTE: the clip group stays open; the caller closes it with '</g>' after placing characters.
