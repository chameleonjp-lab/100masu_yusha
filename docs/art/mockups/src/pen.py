"""Pen: draws the same shapes in two passes.

cut pass  : every shape filled + stroked with the cream 'cut' colour, stroke 9 -> sticker margin
main pass : normal fills with ink outlines (3 px for outer shapes, 2 px for details)

Poses are transforms on parts (data-part="arm-front" etc.). Both passes get the same transforms,
so the margin always follows the pose. This is the construction rule given to the implementer.
"""
from common import P

INK = P['ink']


class Pen:
    def __init__(self, mode='main', outline=3.0, cut_extra=6.0, line_scale=1.0):
        self.mode = mode
        self.ow = outline
        self.ce = cut_extra
        self.ls = line_scale

    @property
    def cut(self):
        return self.mode == 'cut'

    def _style(self, fill, sw, stroke=None, extra=''):
        sw = (self.ow if sw is None else sw) * self.ls
        if self.cut:
            if fill == 'none' and sw == 0:
                return ' fill="none"'
            return (f' fill="{P["cut"] if fill != "none" else "none"}" stroke="{P["cut"]}" '
                    f'stroke-width="{sw + self.ce:.1f}" stroke-linejoin="round" stroke-linecap="round"')
        st = stroke or INK
        if sw == 0:
            return f' fill="{fill}" {extra}'
        return (f' fill="{fill}" stroke="{st}" stroke-width="{sw:.1f}" stroke-linejoin="round" '
                f'stroke-linecap="round" {extra}')

    def path(self, d, fill, sw=None, stroke=None, extra=''):
        return f'<path d="{d}"{self._style(fill, sw, stroke, extra)}/>'

    def circle(self, cx, cy, r, fill, sw=None, stroke=None, extra=''):
        return f'<circle cx="{cx}" cy="{cy}" r="{r}"{self._style(fill, sw, stroke, extra)}/>'

    def ellipse(self, cx, cy, rx, ry, fill, sw=None, stroke=None, extra='', rot=0):
        t = f' transform="rotate({rot} {cx} {cy})"' if rot else ''
        return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}"{t}{self._style(fill, sw, stroke, extra)}/>'

    def rect(self, x, y, w, h, rx, fill, sw=None, stroke=None, extra='', rot=None):
        t = f' transform="rotate({rot[0]} {rot[1]} {rot[2]})"' if rot else ''
        return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}"{t}{self._style(fill, sw, stroke, extra)}/>'

    def line(self, d, sw=2.0, stroke=None, extra=''):
        """Stroke-only detail line."""
        sw *= self.ls
        if self.cut:
            return f'<path d="{d}" fill="none" stroke="{P["cut"]}" stroke-width="{sw + self.ce:.1f}" stroke-linecap="round" stroke-linejoin="round"/>'
        return (f'<path d="{d}" fill="none" stroke="{stroke or INK}" stroke-width="{sw:.1f}" '
                f'stroke-linecap="round" stroke-linejoin="round" {extra}/>')

    def detail(self, svg):
        """Interior-only detail (faces, highlights): skipped in the cut pass."""
        return '' if self.cut else svg


def part(name, body, rot=0, pivot=(0, 0), dx=0, dy=0, sx=1.0, sy=None, hidden=False, opacity=None):
    """A named part. In the asset: <g data-part="name">. Transform order: translate, rotate, scale."""
    sy = sx if sy is None else sy
    t = []
    if dx or dy:
        t.append(f'translate({dx} {dy})')
    if rot:
        t.append(f'rotate({rot} {pivot[0]} {pivot[1]})')
    if sx != 1 or sy != 1:
        t.append(f'translate({pivot[0]} {pivot[1]}) scale({sx} {sy}) translate({-pivot[0]} {-pivot[1]})')
    ta = f' transform="{" ".join(t)}"' if t else ''
    hid = ' display="none"' if hidden else ''
    op = f' opacity="{opacity}"' if opacity is not None else ''
    return f'<g data-part="{name}"{ta}{hid}{op}>{body}</g>'


# ---------------------------------------------------------------- face grammar (shared by all enemies)
def face(pen, kind, eyes, er=4.0, mouth=None, look=-1.0, brow=True, sweat=None, effort=None):
    """kind: idle | attack | big | guard | open | hit
    eyes: [(x,y),(x,y)] ; look: -1 looks left (toward the hero side), +1 right.
    The same 5 faces are used by every enemy so children learn them once.
    """
    if pen.cut:
        return ''
    o = []
    (x1, y1), (x2, y2) = eyes
    cx = (x1 + x2) / 2
    lk = look * er * 0.25
    if kind in ('idle', 'attack'):
        for x, y in eyes:
            o.append(f'<circle cx="{x + lk}" cy="{y}" r="{er}" fill="{INK}"/>')
            o.append(f'<circle cx="{x + lk - er * .35}" cy="{y - er * .35}" r="{er * .32}" fill="#fff"/>')
        if kind == 'attack' and brow:
            for x, y in eyes:
                sgn = 1 if x < cx else -1
                o.append(f'<path d="M{x - sgn * er * 1.6} {y - er * 2.3}L{x + sgn * er * 1.1} {y - er * 1.4}" '
                         f'stroke="{INK}" stroke-width="{max(2, er * .6):.1f}" stroke-linecap="round"/>')
    elif kind == 'big':
        for x, y in eyes:
            sgn = 1 if x < cx else -1
            # half-closed glaring eye: bottom half disc
            o.append(f'<path d="M{x - er * 1.2} {y - er * .2}A{er * 1.2} {er * 1.1} 0 0 0 {x + er * 1.2} {y - er * .2}Z" fill="{INK}"/>')
            o.append(f'<circle cx="{x + lk}" cy="{y + er * .25}" r="{er * .35}" fill="#fff"/>')
            o.append(f'<path d="M{x - sgn * er * 2} {y - er * 2.4}L{x + sgn * er * 1.4} {y - er * .8}" '
                     f'stroke="{INK}" stroke-width="{max(3, er * .95):.1f}" stroke-linecap="round"/>')
    elif kind == 'guard':
        for x, y in eyes:
            o.append(f'<path d="M{x - er * 1.2} {y}Q{x} {y + er * .9} {x + er * 1.2} {y}" fill="none" '
                     f'stroke="{INK}" stroke-width="{max(2, er * .6):.1f}" stroke-linecap="round"/>')
    elif kind == 'open':
        for x, y in eyes:
            o.append(f'<circle cx="{x}" cy="{y}" r="{er * 1.25}" fill="#fff" stroke="{INK}" stroke-width="{max(1.6, er * .45):.1f}"/>')
            o.append(f'<circle cx="{x + lk * .6}" cy="{y + er * .45}" r="{er * .42}" fill="{INK}"/>')
    elif kind == 'hit':
        for x, y in eyes:
            sgn = 1 if x < cx else -1
            o.append(f'<path d="M{x - er} {y - er}L{x + er * sgn * .1 + er * .2} {y}L{x - er} {y + er}" '
                     f'fill="none" stroke="{INK}" stroke-width="{max(2, er * .6):.1f}" stroke-linecap="round" stroke-linejoin="round"/>')
    if mouth:
        mx, my, mw = mouth
        if kind == 'idle':
            o.append(f'<path d="M{mx - mw / 2} {my}Q{mx} {my + mw * .45} {mx + mw / 2} {my}" fill="none" stroke="{INK}" stroke-width="2" stroke-linecap="round"/>')
        elif kind == 'attack':
            o.append(f'<path d="M{mx - mw / 2} {my + mw * .2}L{mx} {my - mw * .15}L{mx + mw / 2} {my + mw * .2}" fill="none" stroke="{INK}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>')
        elif kind == 'big':
            w = mw * 1.2
            o.append(f'<path d="M{mx - w / 2} {my - 2}H{mx + w / 2}L{mx + w * .35} {my + w * .45}H{mx - w * .35}Z" fill="{INK}" stroke="{INK}" stroke-width="2" stroke-linejoin="round"/>')
            n = 4
            for i in range(n):
                tx = mx - w / 2 + 2 + i * (w - 4) / n
                o.append(f'<path d="M{tx} {my - 1.5}l{(w - 4) / n / 2} {w * .18}l{(w - 4) / n / 2} {-w * .18}z" fill="#fff"/>')
        elif kind == 'guard':
            o.append(f'<path d="M{mx - mw * .4} {my}H{mx + mw * .4}" stroke="{INK}" stroke-width="2.2" stroke-linecap="round"/>')
        elif kind == 'open':
            o.append(f'<ellipse cx="{mx}" cy="{my + 2}" rx="{mw * .3}" ry="{mw * .38}" fill="{INK}"/>')
            o.append(f'<ellipse cx="{mx}" cy="{my + 2 + mw * .2}" rx="{mw * .18}" ry="{mw * .12}" fill="#E8838A"/>')
        elif kind == 'hit':
            o.append(f'<path d="M{mx - mw * .4} {my + 2}q{mw * .2} -4 {mw * .4} 0t{mw * .4} 0" fill="none" stroke="{INK}" stroke-width="2" stroke-linecap="round"/>')
    if sweat and kind == 'open':
        sx, sy, ss = sweat
        o.append(f'<path d="M{sx} {sy}c{ss * .5} {ss * .7} {ss * .7} {ss * 1.2} 0 {ss * 1.5}c{-ss * .7} {-ss * .3} {-ss * .5} {-ss * .8} 0 {-ss * 1.5}z" '
                 f'fill="#9FD3F0" stroke="{INK}" stroke-width="1.6"/>')
    if effort and kind == 'big':
        ex, ey, es = effort
        for ang in (-50, -15, 20):
            import math
            a = math.radians(ang - 90)
            x0, y0 = ex + math.cos(a) * es * .55, ey + math.sin(a) * es * .55
            x1_, y1_ = ex + math.cos(a) * es, ey + math.sin(a) * es
            o.append(f'<path d="M{x0:.1f} {y0:.1f}L{x1_:.1f} {y1_:.1f}" stroke="{P["tell-big"]}" stroke-width="3.2" stroke-linecap="round"/>')
    return f'<g data-part="face-{kind}">{"".join(o)}</g>'


def render(fn, pose, x=0, y=0, scale=1.0, flip=False, prefix='', margin=True, opacity=None, dashed=False):
    """Place a character: cut pass (margin) under main pass, same transforms."""
    fx = f' translate({fn.W} 0) scale(-1 1)' if flip else ''
    op = f' opacity="{opacity}"' if opacity is not None else ''
    out = [f'<g class="char {prefix}" transform="translate({x} {y}) scale({scale}){fx}"{op}>']
    if margin and not dashed:
        out.append(f'<g class="cut-pass">{fn(Pen("cut"), pose)}</g>')
    if dashed:
        out.append(f'<g class="ghost" fill-opacity="0.18" stroke-dasharray="7 5">{fn(Pen("main"), pose)}</g>')
    else:
        out.append(f'<g class="main-pass">{fn(Pen("main"), pose)}</g>')
    out.append('</g>')
    return ''.join(out)
