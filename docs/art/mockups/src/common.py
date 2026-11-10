"""Shared helpers, palette, icons and patterns for the 100masu-yusha art-direction mockups.

All output is plain SVG text. Mockups are direction samples (not final assets).
"""
from xml.sax.saxutils import escape

FONT = ('&quot;Hiragino Maru Gothic ProN&quot;,&quot;Hiragino Sans&quot;,&quot;BIZ UDPGothic&quot;,'
        '&quot;Noto Sans JP&quot;,&quot;IPAGothic&quot;,sans-serif')

# ---- Palette (option A = adopted). Keep in sync with art-direction.md section 2. ----
P = {
    'paper': '#F7EEDB', 'paper-card': '#FFF9EC', 'paper-deep': '#EBDDBF', 'cut': '#FFFBF2',
    'ink': '#2A1E16', 'ink-2': '#5A4636', 'ink-3': '#7A6553',
    'act': '#F4B942', 'act-press': '#DE9C26', 'act-edge': '#9A6416',
    'wood': '#D9A86C', 'wood-edge': '#8A5A2B',
    'hp': '#D63F2C', 'hp-track': '#F8DCD3', 'mp': '#3F78C4', 'mp-track': '#D3E1F3',
    'gold': '#E3A41C', 'gold-ink': '#6B4A08', 'xp': '#6FA640',
    'foe-hp': '#7D4C9E', 'foe-hp-track': '#E6DAF0',
    'tell-attack': '#C8562A', 'tell-attack-bg': '#FBE3D3',
    'tell-big': '#B3261E', 'tell-big-bg': '#B3261E',
    'tell-guard': '#47657F', 'tell-guard-bg': '#DCE6EE',
    'tell-open': '#3F7A26', 'tell-open-bg': '#E1F0D2',
    'num-dmg': '#C2361F', 'num-block': '#2F6B9A', 'num-heal': '#2F7D32',
    'k-gold': '#E9BE45', 'k-gear': '#9DB4C8', 'k-battle': '#D9705A', 'k-item': '#D3AE7B',
    'k-heal': '#8DC070', 'k-inn': '#EFA45A', 'k-choice': '#B79AD0', 'k-trap': '#5A514A',
    'route-M': '#976021', 'route-F': '#804e49', 'route-B': '#4c6350', 'route-H': '#46677f',
    'skin': '#F6D2B0', 'cheek': '#F2A08C', 'hair': '#5B3A22', 'leather': '#8A5A2B', 'steel': '#B9C5CE',
    'annot': '#D6247F',
    # dusk (S10, dark mode)
    'dusk-paper': '#2A2336', 'dusk-card': '#3A3149', 'dusk-deep': '#221C2D',
    'dusk-text': '#F5EBD8', 'dusk-text-2': '#CDBFA8', 'dusk-line': '#120E18',
}

KIND = {  # kind -> (tile fill, icon id, label)
    '金貨': ('k-gold', 'i-coin'), '装備': ('k-gear', 'i-gear'), '戦闘': ('k-battle', 'i-battle'),
    '道具': ('k-item', 'i-item'), '回復': ('k-heal', 'i-heal'), '宿場': ('k-inn', 'i-inn'),
    '選択': ('k-choice', 'i-choice'), '罠': ('k-trap', 'i-trap'),
}


def esc(s):
    return escape(str(s))


def text(x, y, s, size=16, weight=400, fill=None, anchor='start', extra=''):
    fill = fill or P['ink']
    return (f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}" '
            f'text-anchor="{anchor}" {extra}>{esc(s)}</text>')


def text_outline(x, y, s, size, fill, stroke, sw, weight=800, anchor='middle'):
    """Text with an ink outline (paint-order). Only for popup numbers."""
    return (f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}" '
            f'stroke="{stroke}" stroke-width="{sw}" paint-order="stroke" stroke-linejoin="round" '
            f'text-anchor="{anchor}">{esc(s)}</text>')


def rect(x, y, w, h, rx=0, fill='none', stroke=None, sw=0, extra=''):
    st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ''
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"{st} {extra}/>'


def use(icon, x, y, size, extra=''):
    return f'<use href="#{icon}" x="{x}" y="{y}" width="{size}" height="{size}" {extra}/>'


def tw(s, size):
    """Rough text width estimate: full-width chars = size, ascii = 0.58*size."""
    w = 0
    for ch in str(s):
        w += size * (0.58 if ord(ch) < 0x2000 else 1.0)
    return w


def svg_doc(w, h, body, title, desc, defs='', bg=None):
    bgrect = rect(0, 0, w, h, fill=bg) if bg else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
            f'font-family="{FONT}">\n'
            f'<title>{esc(title)}</title>\n<desc>{esc(desc)}</desc>\n'
            f'<defs>\n{defs}\n</defs>\n{bgrect}\n{body}\n</svg>\n')


# ---------------------------------------------------------------- phone chrome
def phone_chrome(w, h, label, dark=False, landscape=False):
    """Status bar / Dynamic Island / home indicator placeholders + the mockup label."""
    ink = P['dusk-text'] if dark else P['ink']
    out = ['<g id="device-chrome" opacity="0.9">']
    if not landscape:
        out.append(text(34, 40, '9:41', 16, 700, ink))
        out.append(rect(w / 2 - 62, 11, 124, 36, 18, fill='#000'))
        out.append(rect(w - 64, 28, 26, 12, 3, fill='none', stroke=ink, sw=1.5))
        out.append(rect(w - 62, 30, 18, 8, 1.5, fill=ink))
        out.append(rect(w / 2 - 67, h - 13, 134, 5, 2.5, fill=ink))
    else:
        # notch side on the left, home indicator at bottom
        out.append(rect(11, h / 2 - 62, 36, 124, 18, fill='#000'))
        out.append(rect(w / 2 - 100, h - 9, 200, 5, 2.5, fill=ink))
    out.append('</g>')
    # mockup label, clearly not UI
    lx = w - 8
    out.append(f'<g id="mockup-label"><rect x="{lx - 132}" y="{(52 if not landscape else 4)}" width="132" '
               f'height="18" rx="9" fill="{P["annot"]}"/>'
               + text(lx - 66, (65 if not landscape else 17), label, 11, 700, '#fff', 'middle') + '</g>')
    return '\n'.join(out)


def annot(x, y, n, r=11):
    """Numbered annotation marker (magenta, dashed ring) - explained in the doc."""
    return (f'<g class="annot"><circle cx="{x}" cy="{y}" r="{r}" fill="{P["annot"]}" stroke="#fff" stroke-width="2"/>'
            + text(x, y + 4.5, n, 13, 800, '#fff', 'middle') + '</g>')


def annot_box(x, y, w, h):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="none" stroke="{P["annot"]}" '
            f'stroke-width="2" stroke-dasharray="6 4"/>')


# ---------------------------------------------------------------- icons (symbols, viewBox 0 0 32 32)
I = P['ink']


def icon_defs():
    s = []
    sym = lambda i, body: s.append(f'<symbol id="{i}" viewBox="0 0 32 32">{body}</symbol>')
    def cm(sw=2):
        return f'stroke="{I}" stroke-width="{sw}" stroke-linejoin="round" stroke-linecap="round"'
    common = cm()
    # 金貨: two stacked coins
    sym('i-coin', f'<circle cx="20" cy="13" r="8.5" fill="#F3CF63" {common}/>'
        f'<circle cx="13" cy="19" r="9.5" fill="{P["k-gold"]}" {common}/>'
        f'<circle cx="13" cy="19" r="5.5" fill="none" stroke="#9A6E10" stroke-width="1.6"/>'
        f'<path d="M13 15.5v7" stroke="#9A6E10" stroke-width="1.8" stroke-linecap="round"/>')
    # 装備: shield + sword behind
    sym('i-gear', f'<path d="M6 27L26 7" stroke="{I}" stroke-width="5" stroke-linecap="round"/>'
        f'<path d="M6 27L26 7" stroke="#E8EEF2" stroke-width="2.4" stroke-linecap="round"/>'
        f'<path d="M5 24l3 3M9 22l1 1" {common}/>'
        f'<path d="M17 10l9 3v6c0 5-4 8-9 10c-5-2-9-5-9-10v-6z" fill="{P["k-gear"]}" {common}/>'
        f'<path d="M17 14v11" stroke="#5E7A92" stroke-width="2" stroke-linecap="round"/>')
    # 戦闘: little monster head with horns and fangs
    sym('i-battle', f'<path d="M8 9L6 3l6 4M24 9l2-6-6 4" fill="#F5E6C8" {common}/>'
        f'<path d="M5 18c0-7 5-11 11-11s11 4 11 11c0 6-5 10-11 10S5 24 5 18z" fill="{P["k-battle"]}" {common}/>'
        f'<path d="M9 15l5 2M23 15l-5 2" {common}/>'
        f'<circle cx="12" cy="18.5" r="1.8" fill="{I}"/><circle cx="20" cy="18.5" r="1.8" fill="{I}"/>'
        f'<path d="M11 23h10l-2 3-1.5-2-1.5 2-1.5-2-1.5 2z" fill="#fff" {cm(1.5)}/>')
    # 道具: bag with tie
    sym('i-item', f'<path d="M10 12c-4 4-5 14 0 16h12c5-2 4-12 0-16z" fill="{P["k-item"]}" {common}/>'
        f'<path d="M10 12l-2-5 5 2 3-4 3 4 5-2-2 5" fill="#E9CFA2" {common}/>'
        f'<path d="M10 12h12" {common}/><circle cx="16" cy="20" r="3" fill="#F3E3C3" {cm(1.6)}/>')
    # 回復: two leaves on a stem
    sym('i-heal', f'<path d="M16 29V13" {common}/>'
        f'<path d="M16 19C9 20 5 15 5 9c6 0 11 3 11 10z" fill="{P["k-heal"]}" {common}/>'
        f'<path d="M16 15c1-7 6-11 12-10 0 6-4 11-12 10z" fill="#A9D48E" {common}/>'
        f'<path d="M8 12l6 5M25 8l-7 6" stroke="#4F7F2F" stroke-width="1.4" stroke-linecap="round"/>')
    # 宿場: house with lit window
    sym('i-inn', f'<path d="M7 15v13h18V15" fill="{P["k-inn"]}" {common}/>'
        f'<path d="M3 16L16 5l13 11z" fill="#B5583A" {common}/>'
        f'<rect x="10" y="18" width="6" height="5" fill="#FFE27A" {cm(1.6)}/>'
        f'<path d="M19 28v-8h4v8" fill="#8A5A2B" {cm(1.6)}/>')
    # 選択: signpost with two arrows
    sym('i-choice', f'<path d="M16 29V5" stroke="{I}" stroke-width="3" stroke-linecap="round"/>'
        f'<path d="M15 7H5l-3 3.5L5 14h10z" fill="{P["k-choice"]}" {common}/>'
        f'<path d="M17 15h10l3 3.5L27 22H17z" fill="#D7C6E6" {common}/>')
    # 罠: warning triangle
    sym('i-trap', f'<path d="M16 4L30 27H2z" fill="#F2C230" {cm(2.2)}/>'
        f'<path d="M16 12v8" stroke="{I}" stroke-width="3.2" stroke-linecap="round"/><circle cx="16" cy="23.5" r="1.9" fill="{I}"/>')
    # 宝箱
    sym('i-chest', f'<path d="M4 15h24v12H4z" fill="#C8873E" {common}/>'
        f'<path d="M4 15c0-6 4-9 12-9s12 3 12 9z" fill="#E0A452" {common}/>'
        f'<path d="M4 15h24" {common}/><rect x="13.5" y="13" width="5" height="7" rx="1" fill="#F3CF63" {cm(1.6)}/>')
    # 城
    sym('i-castle', f'<path d="M5 29V13h5v-3h3v3h6v-3h3v3h5v16z" fill="#8E7FA6" {common}/>'
        f'<path d="M13 29v-7a3 3 0 016 0v7" fill="#3B2F4A" {cm(1.6)}/>'
        f'<path d="M16 10V3l5 2-5 2" fill="{P["tell-big"]}" {cm(1.6)}/>')
    # 出発門
    sym('i-start', f'<path d="M5 29V9M27 29V9" stroke="{I}" stroke-width="3" stroke-linecap="round"/>'
        f'<path d="M3 9h26l-2-4H5z" fill="#B5583A" {common}/><path d="M7 14h18" {common}/>')
    # stats
    sym('i-heart', f'<path d="M16 28C7 21 3 16 3 11a6.5 6.5 0 0113-2 6.5 6.5 0 0113 2c0 5-4 10-13 17z" fill="{P["hp"]}" {common}/>'
        f'<path d="M8 10a3 3 0 014-2" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".8"/>')
    sym('i-drop', f'<path d="M16 3c5 8 10 13 10 18a10 10 0 01-20 0c0-5 5-10 10-18z" fill="{P["mp"]}" {common}/>'
        f'<path d="M11 21a5 5 0 003 5" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".8"/>')
    sym('i-star', f'<path d="M16 3l4 8.5 9 1.2-6.6 6.3 1.7 9L16 23.6 7.9 28l1.7-9L3 12.7l9-1.2z" fill="{P["act"]}" {common}/>')
    sym('i-bag', f'<path d="M9 12c-4 4-5 14 0 16h14c5-2 4-12 0-16z" fill="{P["k-item"]}" {common}/>'
        f'<path d="M9 12h14M12 12V8a4 4 0 018 0v4" fill="none" {common}/>')
    sym('i-map', f'<path d="M3 7l8-3 10 3 8-3v21l-8 3-10-3-8 3z" fill="#F3E3C3" {common}/>'
        f'<path d="M11 4v21M21 7v21" {cm(1.5)}/>'
        f'<path d="M6 20c3-2 5 1 8-1s4-6 7-6 4 2 6 0" fill="none" stroke="{P["tell-big"]}" stroke-width="2" stroke-dasharray="2 2.5" stroke-linecap="round"/>')
    sym('i-cog', f'<path d="M16 3l2.6 3.4 4.2-1 .7 4.3 4 1.6-1.7 3.9 2.6 3.4-3.7 2.2.3 4.3-4.3.2-1.9 3.9-3.8-2.1-3.8 2.1-1.9-3.9-4.3-.2.3-4.3L2.6 19l2.6-3.4L3.5 11.7l4-1.6.7-4.3 4.2 1z" fill="#C9B79C" {common}/>'
        f'<circle cx="16" cy="16" r="4.5" fill="{P["paper-card"]}" {common}/>')
    sym('i-sword', f'<path d="M24 4l4 0 0 4-14 14-4-4z" fill="#E8EEF2" {common}/>'
        f'<path d="M7 17l8 8M9 23l-5 5" {cm(3)}/><circle cx="4" cy="28" r="2" fill="{P["act"]}" {cm(1.5)}/>')
    sym('i-shield', f'<path d="M16 3l11 4v8c0 7-5 12-11 14C10 27 5 22 5 15V7z" fill="#9DB4C8" {common}/>'
        f'<path d="M16 7v18M9 13h14" stroke="#5E7A92" stroke-width="2.2" stroke-linecap="round"/>')
    sym('i-spell', f'<path d="M14 3l2.5 8.5L25 14l-8.5 2.5L14 25l-2.5-8.5L3 14l8.5-2.5z" fill="#BFA3E0" {common}/>'
        f'<path d="M25 21l1.2 3.3 3.3 1.2-3.3 1.2L25 30l-1.2-3.3-3.3-1.2 3.3-1.2z" fill="#F3CF63" {cm(1.4)}/>')
    sym('i-run', f'<path d="M28 16H9" {cm(3)}/><path d="M14 9l-7 7 7 7" fill="none" {cm(3)}/>'
        f'<path d="M24 9h4M22 23h6" {cm(1.6)}/>')
    sym('i-sound', f'<path d="M4 12h6l7-6v20l-7-6H4z" fill="#C9B79C" {common}/>'
        f'<path d="M21 11a6 6 0 010 10M24 7a11 11 0 010 18" fill="none" {common}/>')
    sym('i-retry', f'<path d="M25 16a9 9 0 11-3-6.7" fill="none" {cm(2.6)}/><path d="M24 4v6h-6" fill="none" {cm(2.6)}/>')
    sym('i-book', f'<path d="M4 7c4-2 8-2 12 1v19c-4-3-8-3-12-1z" fill="#BFA3E0" {common}/>'
        f'<path d="M28 7c-4-2-8-2-12 1v19c4-3 8-3 12-1z" fill="#D7C6E6" {common}/>')
    sym('i-bell', f'<path d="M8 23c2-3 2-6 2-10a6 6 0 0112 0c0 4 0 7 2 10z" fill="{P["act"]}" {common}/>'
        f'<path d="M6 23h20" {common}/><circle cx="16" cy="26.5" r="2.4" fill="{I}"/><path d="M16 5V3" {common}/>')
    sym('i-crown', f'<path d="M4 25l-1-15 7 6 6-10 6 10 7-6-1 15z" fill="{P["act"]}" {common}/>'
        f'<path d="M4 25h24" {common}/><circle cx="16" cy="19" r="2" fill="{P["tell-big"]}"/>')
    sym('i-foot', f'<ellipse cx="11" cy="20" rx="5" ry="7" fill="{I}"/><ellipse cx="21" cy="12" rx="4.4" ry="6" fill="{I}"/>'
        f'<circle cx="7" cy="11" r="2" fill="{I}"/><circle cx="17" cy="4" r="1.8" fill="{I}"/>')
    sym('i-x', f'<path d="M7 7l18 18M25 7L7 25" {cm(3)}/>')
    # telegraph icons (shape is the code; colour is extra)
    sym('t-attack', f'<path d="M5 27C10 17 17 9 28 4c-6 7-11 14-18 25z" fill="{P["tell-attack"]}" {common}/>')
    burst = 'M16 1l3.2 6.3 6.8-2.2-2.2 6.8L30 15l-6.3 3.2 2.2 6.8-6.8-2.2L16 29l-3.2-6.3-6.8 2.2 2.2-6.8L2 15l6.3-3.2L6.1 5.1l6.8 2.2z'
    sym('t-big', f'<path d="{burst}" fill="#F7D046" {common}/>'
        f'<path d="M12.5 9v8M19.5 9v8" stroke="{I}" stroke-width="3.2" stroke-linecap="round"/>'
        f'<circle cx="12.5" cy="21.5" r="1.9" fill="{I}"/><circle cx="19.5" cy="21.5" r="1.9" fill="{I}"/>')
    sym('t-guard', f'<path d="M16 2l12 4v9c0 8-6 13-12 15C10 28 4 23 4 15V6z" fill="{P["tell-guard"]}" {common}/>'
        f'<path d="M10 13h12M10 18h12" stroke="#DCE6EE" stroke-width="2.6" stroke-linecap="round"/>')
    sym('t-open', f'<circle cx="16" cy="16" r="12" fill="#fff" {common}/>'
        f'<circle cx="16" cy="16" r="7.5" fill="{P["tell-open"]}" {cm(1.6)}/>'
        f'<circle cx="16" cy="16" r="3" fill="#fff" {cm(1.4)}/>'
        f'<path d="M16 1v4M16 27v4M1 16h4M27 16h4" {common}/>')
    # route motifs
    sym('r-M', f'<path d="M9 12c-5 4-5 15 1 17h12c6-2 6-13 1-17z" fill="#E7C27A" {common}/>'
        f'<path d="M10 12l-1-6 4 2 3-4 3 4 4-2-1 6z" fill="#D9A84E" {common}/>'
        f'<circle cx="16" cy="21" r="4.6" fill="#F3CF63" {cm(1.6)}/>'
        f'<path d="M16 19v4" stroke="#9A6E10" stroke-width="1.6" stroke-linecap="round"/>')
    sym('r-F', f'<path d="M18 13L7 29" stroke="{I}" stroke-width="5" stroke-linecap="round"/>'
        f'<path d="M18 13L7 29" stroke="#C99D6A" stroke-width="2.5" stroke-linecap="round"/>'
        f'<path d="M10 9l8-6 9 12-8 6z" fill="#8D9AA5" {common}/><path d="M14 6l9 12" stroke="#5E6A74" stroke-width="1.5"/>')
    sym('r-B', f'<ellipse cx="16" cy="22" rx="7.5" ry="6.5" fill="#6E8C70" {common}/>'
        f'<ellipse cx="6.5" cy="13.5" rx="3" ry="4" fill="#6E8C70" {common}/>'
        f'<ellipse cx="12" cy="7.5" rx="3" ry="4" fill="#6E8C70" {common}/>'
        f'<ellipse cx="20" cy="7.5" rx="3" ry="4" fill="#6E8C70" {common}/>'
        f'<ellipse cx="25.5" cy="13.5" rx="3" ry="4" fill="#6E8C70" {common}/>')
    for n in range(1, 7):   # die faces d-1 .. d-6
        sym(f'd-{n}', die_face(2, 2, 28, n))
    sym('r-H', f'<path d="M11 8h10l2 4H9z" fill="#5E7F98" {common}/>'
        f'<path d="M10 12h12v13H10z" fill="#FBE7A6" {common}/>'
        f'<path d="M16 23c-3 0-4-2-4-4 0-3 4-5 4-8 1 3 4 5 4 8 0 2-1 4-4 4z" fill="#F29A3A" {cm(1.4)}/>'
        f'<path d="M9 25h14v3H9zM16 8V4" fill="#5E7F98" {common}/>')
    return '\n'.join(s)


def pattern_defs(prefix=''):
    """Route patterns. Light marks over the route colour (or ink marks on tints)."""
    c = 'rgba(255,251,242,.42)'
    return f'''
<pattern id="{prefix}pat-M" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="2.1" fill="{c}"/><circle cx="9" cy="9" r="2.1" fill="{c}"/></pattern>
<pattern id="{prefix}pat-F" width="16" height="12" patternUnits="userSpaceOnUse"><path d="M0 .75H16M0 6.75H16M.75 0V6M8.75 6V12" stroke="{c}" stroke-width="1.5" fill="none"/></pattern>
<pattern id="{prefix}pat-B" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M2 12l4-8M6 14l4-8M10 15l4-8" stroke="{c}" stroke-width="1.7" stroke-linecap="round"/></pattern>
<pattern id="{prefix}pat-H" width="16" height="10" patternUnits="userSpaceOnUse"><path d="M0 6Q4 1 8 6T16 6" stroke="{c}" stroke-width="1.6" fill="none"/></pattern>
<pattern id="{prefix}hatch-red" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="rgba(179,38,30,.16)"/><path d="M0 0V8" stroke="rgba(179,38,30,.75)" stroke-width="3"/></pattern>
'''


# ---------------------------------------------------------------- UI building blocks (option A)
def die_face(x, y, size, n, fill='#fff', ink=None, rx=None):
    ink = ink or P['ink']
    rx = size * 0.22 if rx is None else rx
    out = [rect(x, y, size, size, rx, fill=fill, stroke=ink, sw=max(1.5, size * 0.07))]
    r = size * 0.095
    a, b, c = x + size * 0.27, x + size * 0.5, x + size * 0.73
    d, e, f = y + size * 0.27, y + size * 0.5, y + size * 0.73
    pts = {1: [(b, e)], 2: [(a, d), (c, f)], 3: [(a, d), (b, e), (c, f)],
           4: [(a, d), (c, d), (a, f), (c, f)], 5: [(a, d), (c, d), (b, e), (a, f), (c, f)],
           6: [(a, d), (c, d), (a, e), (c, e), (a, f), (c, f)]}[n]
    for px, py in pts:
        out.append(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="{r:.1f}" fill="{ink}"/>')
    return ''.join(out)


def plaque(x, y, w, h, label, icon=None, primary=True, sub=None, size=None, disabled=False, rx=14,
           face=None, edge=None, ink=None):
    """Wooden plaque button = 'my operation'. Thickness under it (hard edge), never blurred."""
    face = face or (P['act'] if primary else P['wood'])
    edge = edge or (P['act-edge'] if primary else P['wood-edge'])
    ink = ink or P['ink']
    size = size or (20 if primary else 17)
    op = ' opacity="0.45"' if disabled else ''
    out = [f'<g class="plaque"{op}>', rect(x, y + 4, w, h, rx, fill=edge, stroke=ink, sw=2.5),
           rect(x, y, w, h, rx, fill=face, stroke=ink, sw=2.5),
           f'<path d="M{x + rx} {y + 4}H{x + w - rx}" stroke="rgba(255,255,255,.55)" stroke-width="2.5" stroke-linecap="round"/>']
    cy = y + h / 2
    if icon:
        isz = min(34, h * 0.5)
        lw = tw(label, size)
        total = isz + 8 + lw
        ix = x + (w - total) / 2
        out.append(use(icon, ix, cy - isz / 2 - (6 if sub else 0), isz))
        out.append(text(ix + isz + 8, cy + size * 0.36 - (6 if sub else 0), label, size, 800, ink))
        if sub:
            out.append(text(x + w / 2, cy + 20, sub, 13, 700, P['ink-2'], 'middle'))
    else:
        out.append(text(x + w / 2, cy + size * 0.36 - (7 if sub else 0), label, size, 800, ink, 'middle'))
        if sub:
            out.append(text(x + w / 2, cy + 18, sub, 13, 700, P['ink-2'], 'middle'))
    out.append('</g>')
    return '\n'.join(out)


def card(x, y, w, h, rx=12, fill=None, stroke=None, sw=2, shadow=True, dark=False):
    fill = fill or (P['dusk-card'] if dark else P['paper-card'])
    stroke = stroke or (P['dusk-line'] if dark else P['ink'])
    sh = rect(x, y + 3, w, h, rx, fill='rgba(42,30,22,.22)' if not dark else 'rgba(0,0,0,.45)') if shadow else ''
    return sh + rect(x, y, w, h, rx, fill=fill, stroke=stroke, sw=sw)


def bar(x, y, w, h, frac, fill, track, ink=None, ghost=None):
    ink = ink or P['ink']
    out = [rect(x, y, w, h, h / 2, fill=track)]
    if ghost:
        out.append(rect(x, y, max(h, w * ghost), h, h / 2, fill='#fff', extra='opacity="0.85"'))
        out.append(rect(x, y, max(h, w * ghost), h, h / 2, fill=fill, extra='opacity="0.35"'))
    out.append(rect(x, y, max(h, w * frac), h, h / 2, fill=fill))
    out.append(rect(x, y, w, h, h / 2, fill='none', stroke=ink, sw=2))
    return ''.join(out)


def chip(x, y, label, fill, ink=None, size=14, icon=None, h=26, stroke=None, weight=800):
    ink = ink or P['ink']
    w = tw(label, size) + 20 + (h - 6 if icon else 0)
    out = [rect(x, y, w, h, h / 2, fill=fill, stroke=stroke or P['ink'], sw=1.8)]
    tx = x + 10
    if icon:
        out.append(use(icon, x + 6, y + 3, h - 6))
        tx += h - 6
    out.append(text(tx, y + h / 2 + size * 0.36, label, size, weight, ink))
    return ''.join(out), w
