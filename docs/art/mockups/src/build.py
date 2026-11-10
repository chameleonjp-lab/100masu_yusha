"""Build the art-direction mockups into docs/art/mockups/.
usage: python3 build.py [name ...]     (no args = build all)
Mockups are direction samples, not final assets.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import P, KIND, svg_doc, icon_defs, pattern_defs, text, text_outline, rect, use, tw, die_face, plaque, card, bar, chip, phone_chrome, annot, annot_box
from pen import render
from heroes import hero, companion
from enemies import mb01
import scenes as S

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
INK = P['ink']
BUILDERS = {}


def builder(name):
    def deco(fn):
        BUILDERS[name] = fn
        return fn
    return deco


def write(name, svg):
    path = os.path.join(OUT, name)
    with open(path, 'w') as f:
        f.write(svg)
    print('wrote', path, len(svg) // 1024, 'KB')


# ---------------------------------------------------------------- shared option-A widgets
def route_chip(x, y, route, name):
    w = 8 + 26 + 8 + tw(name, 16) + 14
    return (f'<g class="route-chip">{rect(x, y + 3, w, 34, 17, fill="rgba(42,30,22,.25)")}'
            f'{rect(x, y, w, 34, 17, fill=P["route-" + route], stroke=INK, sw=2)}'
            f'{rect(x, y, w, 34, 17, fill=f"url(#pat-{route})")}'
            f'<circle cx="{x + 21}" cy="{y + 17}" r="13" fill="{P["cut"]}" stroke="{INK}" stroke-width="2"/>'
            + use(f'r-{route}', x + 10, y + 6, 22) + text(x + 42, y + 23, name, 16, 800, P['cut']) + '</g>'), w


def icon_button(x, y, icon, size=44):
    return (rect(x, y + 3, size, size, 12, fill='rgba(42,30,22,.22)') + rect(x, y, size, size, 12, fill=P['paper-card'], stroke=INK, sw=2)
            + use(icon, x + size * .2, y + size * .2, size * .6))


def status_card(x, y, w, hp, hpmax, mp, mpmax, gold, lv, job):
    o = [card(x, y, w, 48, 12)]
    o.append(use('i-heart', x + 8, y + 5, 18) + text(x + 30, y + 19, '体力', 13, 700, P['ink-2'])
             + text(x + 62, y + 21, f'{hp}/{hpmax}', 18, 800) + bar(x + 128, y + 9, 140, 11, hp / hpmax, P['hp'], P['hp-track']))
    o.append(use('i-coin', x + w - 92, y + 4, 20) + text(x + w - 68, y + 21, f'{gold}G', 17, 800))
    o.append(use('i-drop', x + 8, y + 26, 17) + text(x + 30, y + 40, '魔力', 13, 700, P['ink-2'])
             + text(x + 62, y + 41, f'{mp}/{mpmax}', 15, 800) + bar(x + 128, y + 31, 80, 9, mp / mpmax, P['mp'], P['mp-track']))
    o.append(use('i-star', x + w - 92, y + 26, 17) + text(x + w - 70, y + 41, f'Lv{lv} {job}', 14, 800))
    return ''.join(o)


def seg_toggle(x, y, w, h, labels, sel=0):
    n = len(labels)
    sw_ = w / n
    o = [rect(x, y + 3, w, h, 12, fill='rgba(42,30,22,.22)'), rect(x, y, w, h, 12, fill=P['wood'], stroke=INK, sw=2.5)]
    o.append(f'<rect x="{x + sel * sw_ + 3}" y="{y + 3}" width="{sw_ - 6}" height="{h - 6}" rx="9" fill="{P["act"]}" stroke="{INK}" stroke-width="2"/>')
    for i, lb in enumerate(labels):
        o.append(text(x + sw_ * i + sw_ / 2, y + h / 2 + 6, lb, 16, 800, INK, 'middle'))
    o.append(f'<path d="M{x + sw_} {y + 8}V{y + h - 8}" stroke="{INK}" stroke-width="1.5" opacity=".4"/>')
    return ''.join(o)


def face_badge(cx, cy, r, role):
    cid = f'fb-{role}-{int(cx)}-{int(cy)}'
    s = (r * 2.2) / 40
    return (f'<defs><clipPath id="{cid}"><circle cx="{cx}" cy="{cy}" r="{r}"/></clipPath></defs>'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#EFE3C8"/>'
            f'<g clip-path="url(#{cid})">{render(companion(role), "idle", cx - 50 * s, cy - 50 * s, s, margin=False)}</g>'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{INK}" stroke-width="2"/>')


# ================================================================ OPTION A — board (pre-roll)
@builder('option-a-board.svg')
def option_a_board():
    W, H = 402, 874
    b = [rect(0, 0, W, H, fill=P['paper'])]
    chipsvg, cw = route_chip(16, 70, 'M', '金貨の商人道')
    b.append(chipsvg)
    b.append(text(16 + cw + 12, 84, '第1区間', 13, 700, P['ink-2']) + text(16 + cw + 12, 104, '草原の門出', 16, 800))
    b.append(text(334, 104, '4/100', 14, 800, P['ink-2'], 'end'))
    b.append(icon_button(342, 66, 'i-cog'))
    b.append(status_card(16, 116, 370, 32, 40, 8, 10, 200, 1, '旅人'))
    # ---- scene
    y0, sh = 170, 420
    b += S.board_scene_band1(0, y0, W, sh)
    road = [(200, 610), (200, 538), (300, 494), (336, 428), (250, 392), (156, 356), (96, 306), (158, 276), (226, 262)]
    d = S.smooth(road)
    b.append(f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>'
             f'<path d="{d}" fill="none" stroke="#E9D3A2" stroke-width="35" stroke-linecap="round" stroke-linejoin="round"/>'
             f'<path d="{d}" fill="none" stroke="#D2B47A" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>'
             f'<path d="{d}" fill="none" stroke="#E9D3A2" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>')
    b.append(S.grass_tufts([(30, 520), (64, 572), (120, 470), (352, 566), (380, 470), (112, 424), (300, 566), (20, 470)]))
    b.append(S.flowers([(44, 540), (72, 516), (340, 584), (368, 540), (128, 584), (382, 432)]))
    b.append(S.stall(14, 400))
    b.append(S.signpost(374, 376, 'M'))
    # tiles far -> near
    b.append(S.tile(158, 276, 40, '金貨', faded=True))
    b.append(S.tile(96, 306, 44, '金貨', faded=True))
    b.append(S.tile(156, 356, 64, '宿場', step=4, inn_flag=True))
    b.append(S.tile(250, 392, 52, '道具', step=3))
    b.append(S.tile(336, 428, 56, '金貨', step=2))
    b.append(S.tile(300, 494, 62, '装備', step=1, treasure=True))
    b.append(S.tile(200, 538, 80, '道具'))
    b.append(f'<ellipse cx="200" cy="540" rx="22" ry="6" fill="rgba(42,30,22,.25)"/>')
    b.append(render(hero('traveler', 'idle'), 'idle', 200 - 60 * .5, 538 - 152 * .5, .5))
    # current-square plate
    b.append(card(16, 552, 150, 30, 15) + f'<circle cx="32" cy="567" r="11" fill="{P["act"]}" stroke="{INK}" stroke-width="2"/>'
             + text(32, 572, '4', 14, 900, INK, 'middle') + text(48, 573, 'ひっくり返る的', 14, 800))
    b.append('</g>')  # end scene clip
    b.append(f'<path d="M0 {y0}H{W}M0 {y0 + sh}H{W}" stroke="{INK}" stroke-width="2.5"/>')
    # ---- next-6 strip
    b.append(text(16, 612, 'つぎの6マス', 14, 800, P['ink-2']))
    b.append(use('i-inn', 262, 597, 20) + text(386, 612, '宿まで あと4', 14, 800, INK, 'end'))
    kinds = ['装備', '金貨', '道具', '宿場', '金貨', '金貨']
    cw_, gap = 56, (370 - 6 * 56) / 5
    for i, k in enumerate(kinds):
        cx = 16 + i * (cw_ + gap)
        b.append(S.strip_card(cx, 620, cw_, 72, i + 1, k, faded=i >= 4, emph=(i == 3)))
    b.append(use('i-chest', 16 + 56 - 16, 612, 20))
    x4 = 16 + 3 * (cw_ + gap)
    x6 = 16 + 5 * (cw_ + gap) + cw_
    b.append(f'<path d="M{x4 + 4} 700V706H{x6 - 4}V700" fill="none" stroke="{INK}" stroke-width="2"/>')
    b.append(text(386, 724, '4・5・6が出ても 宿（8）で止まる', 14, 800, P['ink-2'], 'end'))
    # ---- buttons
    bw = (370 - 16) / 3
    b.append(plaque(16, 734, bw, 48, '全体地図', 'i-map', primary=False, size=16))
    b.append(plaque(16 + bw + 8, 734, bw, 48, '道具袋 3/6', 'i-bag', primary=False, size=16))
    b.append(plaque(16 + 2 * (bw + 8), 734, bw, 48, '装備', 'i-gear', primary=False, size=16))
    b.append(plaque(16, 792, 370, 48, 'サイコロを振る', 'd-5', primary=True, size=20))
    b.append(phone_chrome(W, H, '見本A・最終素材ではない'))
    return svg_doc(W, H, '\n'.join(b), 'option A board', '見本A（切り絵の紙しばい）: 盤面・次の6マス。最終素材ではない。',
                   icon_defs() + S_pattern_defs())


def S_pattern_defs():
    return pattern_defs()


# ================================================================ OPTION A — battle (big-attack telegraph)
@builder('option-a-battle.svg')
def option_a_battle():
    W, H = 402, 874
    b = [rect(0, 0, W, H, fill=P['paper'])]
    # top bar: enemy plate
    b.append(card(16, 66, 370, 40, 12))
    b.append(text(28, 92, '石門番', 18, 800))
    b.append(rect(90, 76, 46, 22, 11, fill=INK) + text(113, 92, '強敵', 13, 800, P['cut'], 'middle'))
    b.append(text(150, 92, '体力', 13, 700, P['ink-2']))
    b.append(bar(180, 80, 150, 13, 52 / 70, P['foe-hp'], P['foe-hp-track']))
    b.append(text(376, 92, '52/70', 14, 800, INK, 'end'))
    # stage
    y0, sh = 112, 330
    b.append(S.mine_backdrop(0, y0, W, sh))
    b.append(S.danger_shadow(104, 428, 98, 14))
    b.append(render(mb01('big'), 'big', 186, 436 - 246 * .82, .82))
    b.append(render(companion('medic'), 'idle', 2, 432 - 134 * .62, .62))
    b.append(render(companion('shield'), 'idle', 46, 432 - 134 * .62, .62))
    b.append(render(hero('warrior', 'idle'), 'idle', 104, 432 - 152 * .72, .72))
    tag, th = S.telegraph_tag(14, 128, 210, '大技', '石腕の大振り', '石の腕を頭上で止めてから、重い一振りを放つ。', 46, 14, string_top=y0)
    b.append(tag)
    b.append('</g>')  # end stage clip (opened in mine_backdrop)
    b.append(f'<path d="M0 {y0}H{W}M0 {y0 + sh}H{W}" stroke="{INK}" stroke-width="2.5"/>')
    # party board
    b.append(card(16, 450, 370, 92, 12))
    b.append(use('i-heart', 26, 459, 20) + text(50, 474, '体力', 13, 700, P['ink-2'])
             + bar(84, 462, 186, 15, 41 / 52, P['hp'], P['hp-track']) + text(376, 477, '41/52', 22, 900, INK, 'end'))
    b.append(use('i-drop', 26, 484, 18) + text(50, 498, '魔力', 13, 700, P['ink-2'])
             + bar(84, 488, 120, 10, 14 / 22, P['mp'], P['mp-track']) + text(260, 499, '14/22', 16, 800, INK, 'end'))
    b.append(f'<path d="M26 508H376" stroke="{INK}" stroke-width="1.2" opacity=".3"/>')
    b.append(face_badge(40, 525, 14, 'shield') + text(60, 522, '盾役', 12, 800, P['ink-2']) + text(60, 537, '大技の前に かばう', 13, 800))
    b.append(face_badge(212, 525, 14, 'medic') + text(232, 522, '薬師', 12, 800, P['ink-2']) + text(232, 537, '体力半分以下で 回復', 13, 800))
    # log strip
    b.append(card(16, 550, 370, 34, 10, fill='#FFFDF6'))
    b.append(text(28, 573, '3手め：石門番が 石の腕を 頭上で止めた！', 15, 700))
    # actions
    bw, bh = 181, 78
    b.append(plaque(16, 594, bw, bh, '攻撃', 'i-sword'))
    b.append(plaque(16 + bw + 8, 594, bw, bh, '防御', 'i-shield'))
    b.append(plaque(16, 594 + bh + 10, bw, bh, '呪文', 'i-spell', sub='魔力を使う'))
    b.append(plaque(16 + bw + 8, 594 + bh + 10, bw, bh, '道具', 'i-bag', sub='袋 3こ'))
    b.append(plaque(16, 776, 150, 44, '逃げる', 'i-run', primary=False, size=16, disabled=True))
    b.append(text(91, 834, '強敵からは にげられない', 12, 700, P['ink-2'], 'middle'))
    b.append(seg_toggle(186, 776, 200, 44, ['標準', '短縮'], 0))
    b.append(phone_chrome(W, H, '見本A・最終素材ではない'))
    return svg_doc(W, H, '\n'.join(b), 'option A battle', '見本A（切り絵の紙しばい）: 戦闘・石門番の大技の予告。最終素材ではない。',
                   icon_defs() + pattern_defs())


# ================================================================ OPTION B — watercolour travel journal (rejected)
B = {'paper': '#FBF8F1', 'line': '#6B5B4B', 'text': '#5A4636', 'rule': '#CFE0EA', 'margin': '#E9A8A0'}
PEN_B = {'outline': 1.25, 'ink': B['line'], 'line_scale': 0.6}


def b_defs():
    return (icon_defs() + pattern_defs()
            + '<filter id="wc" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="3" seed="7" result="n"/>'
              '<feDisplacementMap in="SourceGraphic" in2="n" scale="12" xChannelSelector="R" yChannelSelector="G"/></filter>'
            + '<filter id="wc2" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="3" result="n"/>'
              '<feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G"/></filter>'
            + '<radialGradient id="glow-red"><stop offset="0" stop-color="#E07A6A" stop-opacity=".6"/><stop offset=".6" stop-color="#E07A6A" stop-opacity=".25"/><stop offset="1" stop-color="#E07A6A" stop-opacity="0"/></radialGradient>'
            + '<pattern id="ruled" width="402" height="28" patternUnits="userSpaceOnUse"><path d="M0 27.5H402" stroke="#CFE0EA" stroke-width="1"/></pattern>')


def b_page(W, H):
    return rect(0, 0, W, H, fill=B['paper']) + rect(0, 0, W, H, fill='url(#ruled)') + f'<path d="M30 0V{H}" stroke="{B["margin"]}" stroke-width="1.2"/>'


def wash(d, color, op=.55, filt='wc'):
    return f'<path d="{d}" fill="{color}" opacity="{op}" filter="url(#{filt})"/>'


def b_text(x, y, s, size=16, weight=500, fill=None, anchor='start'):
    return text(x, y, s, size, weight, fill or B['text'], anchor)


def pill(x, y, w, h, label, icon, color, sub=None, disabled=False):
    op = ' opacity=".45"' if disabled else ''
    o = [f'<g class="pill"{op}>', f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h / 2}" fill="{color}" opacity=".85" filter="url(#wc2)"/>',
         f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h / 2}" fill="none" stroke="{B["line"]}" stroke-width="1.25"/>']
    lw = tw(label, 18)
    ix = x + (w - (24 + 8 + lw)) / 2
    cy = y + h / 2 - (6 if sub else 0)
    o.append(f'<g opacity=".8">{use(icon, ix, cy - 12, 24)}</g>' + b_text(ix + 32, cy + 6.5, label, 18, 500))
    if sub:
        o.append(b_text(x + w / 2, cy + 24, sub, 12, 500, '#8A7A6A', 'middle'))
    o.append('</g>')
    return ''.join(o)


def thin_bar(x, y, w, frac, color):
    return (f'<path d="M{x} {y}H{x + w}" stroke="#E9E1D3" stroke-width="6" stroke-linecap="round"/>'
            f'<path d="M{x} {y}H{x + w * frac:.1f}" stroke="{color}" stroke-width="6" stroke-linecap="round" opacity=".75"/>')


@builder('option-b-battle.svg')
def option_b_battle():
    W, H = 402, 874
    b = [b_page(W, H)]
    b.append(b_text(40, 94, '石門番', 18, 700) + b_text(104, 94, '（強敵）', 13, 500, '#8A7A6A'))
    b.append(b_text(186, 94, '体力', 13) + thin_bar(222, 89, 110, 52 / 70, '#9C7BB8') + b_text(386, 94, '52/70', 14, 500, None, 'end'))
    # stage: soft washes
    b.append(wash('M10 120Q200 96 392 124L388 420Q200 446 14 418Z', '#C9B79C', .45))
    b.append(wash('M20 360Q200 340 384 366L380 440Q200 452 22 436Z', '#B09A80', .45))
    b.append(wash('M120 150Q150 130 180 152Q160 180 130 176Z', '#F4D37A', .5))
    b.append(f'<ellipse cx="292" cy="300" rx="130" ry="150" fill="url(#glow-red)"/>')
    b.append(f'<ellipse cx="110" cy="430" rx="110" ry="26" fill="url(#glow-red)" opacity=".7"/>')
    b.append(f'<g opacity=".88">{render(mb01("big"), "big", 186, 436 - 246 * .82, .82, margin=False, pen_kw=PEN_B)}</g>')
    b.append(f'<g opacity=".88">{render(companion("medic"), "idle", 2, 432 - 134 * .62, .62, margin=False, pen_kw=PEN_B)}'
             f'{render(companion("shield"), "idle", 46, 432 - 134 * .62, .62, margin=False, pen_kw=PEN_B)}'
             f'{render(hero("warrior", "idle"), "idle", 104, 432 - 152 * .72, .72, margin=False, pen_kw=PEN_B)}</g>')
    # sticky note
    b.append('<g transform="rotate(-3 110 210)">'
             + f'<rect x="22" y="134" width="176" height="150" fill="#FFF3B8" opacity=".92" filter="url(#wc2)"/>'
             + f'<rect x="22" y="134" width="176" height="150" fill="none" stroke="{B["line"]}" stroke-width="1"/>'
             + b_text(34, 160, 'つぎは 大技', 16, 500, '#B3261E')
             + b_text(34, 184, '石腕の大振り', 15, 700)
             + ''.join(b_text(34, 206 + i * 20, ln, 14, 500) for i, ln in enumerate(S.wrap('石の腕を頭上で止めてから、重い一振りを放つ。', 14, 150)))
             + b_text(34, 272, '攻撃46・防御14', 12, 500, '#8A7A6A') + '</g>')
    # party
    b.append(b_text(40, 478, '体力', 13) + thin_bar(80, 473, 200, 41 / 52, '#E8968A') + b_text(386, 480, '41/52', 18, 600, None, 'end'))
    b.append(b_text(40, 504, '魔力', 13) + thin_bar(80, 499, 130, 14 / 22, '#8FB4DE') + b_text(270, 506, '14/22', 14, 500, None, 'end'))
    b.append(b_text(40, 534, '盾役：大技の前にかばう　薬師：半分以下で回復', 13, 500, '#8A7A6A'))
    b.append(b_text(40, 572, '石門番が 石の腕を 頭上で止めた', 15, 500))
    bw, bh = 170, 72
    b.append(pill(36, 596, bw, bh, '攻撃', 'i-sword', '#F6E3C4'))
    b.append(pill(36 + bw + 10, 596, bw, bh, '防御', 'i-shield', '#DDE8EF'))
    b.append(pill(36, 596 + bh + 12, bw, bh, '呪文', 'i-spell', '#E9E0F2', sub='魔力を使う'))
    b.append(pill(36 + bw + 10, 596 + bh + 12, bw, bh, '道具', 'i-bag', '#EFE6D2', sub='袋 3こ'))
    b.append(pill(36, 780, 150, 44, '逃げる', 'i-run', '#EFE6D2', disabled=True))
    b.append(b_text(386, 808, '演出：標準 ／ 短縮', 14, 500, '#8A7A6A', 'end'))
    b.append(phone_chrome(W, H, '見本B・不採用'))
    return svg_doc(W, H, '\n'.join(b), 'option B battle', '見本B（水彩の旅日記・不採用）: 戦闘・石門番の大技の予告。', b_defs())


@builder('option-b-board.svg')
def option_b_board():
    W, H = 402, 874
    b = [b_page(W, H)]
    b.append(b_text(40, 92, '金貨の商人道', 18, 700) + b_text(40, 112, '第1区間・草原の門出　4/100', 13, 500, '#8A7A6A'))
    b.append(b_text(40, 146, '体力', 13) + thin_bar(76, 141, 150, 32 / 40, '#E8968A') + b_text(270, 148, '32/40', 15, 600, None, 'end')
             + b_text(386, 148, '200G', 15, 600, None, 'end'))
    b.append(b_text(40, 168, '魔力', 13) + thin_bar(76, 163, 80, 8 / 10, '#8FB4DE') + b_text(200, 170, '8/10', 13, 500, None, 'end')
             + b_text(386, 170, 'Lv1 旅人', 13, 500, None, 'end'))
    # map washes
    b.append(wash('M14 190Q200 176 390 196L388 330Q200 340 16 326Z', '#BFDDEB', .5))
    b.append(wash('M10 300Q120 270 220 300T392 296L390 590Q200 600 12 588Z', '#BFD9A0', .55))
    b.append(wash('M40 250Q120 220 200 250T360 240L362 300Q200 310 40 300Z', '#A9C98A', .45))
    b.append(f'<g opacity=".7" transform="translate(212 196)"><path d="M0 40V22h6v-6h4v6h8V10h-2V4h10v6h-2v12h8v-6h4v6h6v18Z" fill="none" stroke="{B["line"]}" stroke-width="1"/></g>')
    road = [(200, 610), (200, 538), (300, 494), (336, 428), (250, 392), (156, 356), (96, 306), (158, 276), (226, 246)]
    b.append(f'<path d="{S.smooth(road)}" fill="none" stroke="#8A7A6A" stroke-width="2" stroke-dasharray="2 7" stroke-linecap="round"/>')
    stamps = [((158, 276), 14, '金貨', .35), ((96, 306), 15, '金貨', .35), ((156, 356), 22, '宿場', 1), ((250, 392), 18, '道具', 1),
              ((336, 428), 19, '金貨', 1), ((300, 494), 20, '装備', 1), ((200, 538), 26, '道具', 1)]
    for (cx, cy), r, k, op in stamps:
        fk, ic = KIND[k]
        b.append(f'<g opacity="{op}"><circle cx="{cx}" cy="{cy}" r="{r}" fill="{P[fk]}" opacity=".55" filter="url(#wc2)"/>'
                 f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{B["line"]}" stroke-width="1"/>'
                 f'<g opacity=".7">{use(ic, cx - r * .6, cy - r * .6, r * 1.2)}</g></g>')
    for (cx, cy), n in [((300, 494), 1), ((336, 428), 2), ((250, 392), 3), ((156, 356), 4)]:
        b.append(b_text(cx + 18, cy - 16, str(n), 13, 600, '#8A7A6A'))
    b.append(f'<g opacity=".9">{render(hero("traveler", "idle"), "idle", 200 - 60 * .42, 532 - 152 * .42, .42, margin=False, pen_kw=PEN_B)}</g>')
    b.append(b_text(40, 586, 'いま：4 ひっくり返る的', 14, 500))
    # next 6
    b.append(b_text(40, 626, 'つぎの6マス', 14, 600) + b_text(386, 626, '宿まで あと4', 13, 500, '#8A7A6A', 'end'))
    for i, k in enumerate(['装備', '金貨', '道具', '宿場', '金貨', '金貨']):
        cx = 64 + i * 56
        fk, ic = KIND[k]
        op = .35 if i >= 4 else 1
        b.append(f'<g opacity="{op}">' + b_text(cx, 650, str(i + 1), 12, 600, '#8A7A6A', 'middle')
                 + f'<circle cx="{cx}" cy="{674}" r="18" fill="{P[fk]}" opacity=".5" filter="url(#wc2)"/>'
                 + f'<circle cx="{cx}" cy="674" r="18" fill="none" stroke="{B["line"]}" stroke-width="1"/>'
                 + f'<g opacity=".7">{use(ic, cx - 11, 663, 22)}</g>' + b_text(cx, 710, k, 12, 500, None, 'middle') + '</g>')
    b.append(b_text(386, 734, '4〜6は 宿でとまる', 12, 500, '#8A7A6A', 'end'))
    bw = 104
    b.append(pill(36, 748, bw, 40, '地図', 'i-map', '#EFE6D2'))
    b.append(pill(36 + bw + 9, 748, bw, 40, '道具袋', 'i-bag', '#EFE6D2'))
    b.append(pill(36 + 2 * (bw + 9), 748, bw, 40, '装備', 'i-gear', '#EFE6D2'))
    b.append(pill(36, 796, 330, 44, 'サイコロを振る', 'd-5', '#F6E3C4'))
    b.append(phone_chrome(W, H, '見本B・不採用'))
    return svg_doc(W, H, '\n'.join(b), 'option B board', '見本B（水彩の旅日記・不採用）: 盤面・次の6マス。', b_defs())


# ================================================================ SHEETS
from enemies import ENEMIES, mb02, mb03, dk01, en09, en10, en12, en13
from pen import Pen, face as face_fn


def sheet_title(x, y, s, sub=None):
    o = text(x, y, s, 22, 900)
    if sub:
        o += text(x, y + 22, sub, 13, 700, P['ink-2'])
    return o


def label_plate(cx, y, s, size=13, sub=None):
    w = max(tw(s, size), tw(sub, 12) if sub else 0) + 16
    h = 22 if not sub else 38
    o = rect(cx - w / 2, y, w, h, 8, fill=P['paper-card'], stroke=INK, sw=1.5) + text(cx, y + 16, s, size, 800, INK, 'middle')
    if sub:
        o += text(cx, y + 32, sub, 12, 700, P['ink-2'], 'middle')
    return o


@builder('sheet-telegraph.svg')
def sheet_telegraph():
    W, H = 860, 800
    b = [rect(0, 0, W, H, fill=P['paper']), sheet_title(24, 40, '予告の4種類（見本）', '札の形・絵記号・言葉・敵の体と顔・画面の追加が同じことを言う。色と音は補助。')]
    items = [('通常攻撃', en13, 'attack', '槍の石突きで打つ', '槍を反して柄の端を横に振る。', 34, 14, '城壁槍コボルト'),
             ('大技', en12, 'big', '翼を広げて急降下する', '両翼が大きく開き、勇者の足元に丸い影が落ちる。', 37, 11, '霧鈴フクロウ'),
             ('守り', en09, 'guard', '草盾を立てる', '編んだ草を盾にする。この手は攻撃しない。', 0, 5, '草盾タヌキ'),
             ('反撃の隙', en10, 'open', '石段で息をつく', '石段に上がって呼吸を整える。攻撃は来ない。', 0, 3, '水車カワウソ')]
    for i, (kind, fn, pose, name, tell, atk, dfn, who) in enumerate(items):
        x = 20 + i * 210
        tag, th = S.telegraph_tag(x, 84, 196, kind, name, tell, atk, dfn)
        b.append(tag)
        b.append(render(fn(pose), pose, x - 2, 340, 1.0))
        b.append(label_plate(x + 98, 548, who, 13, f'{kind}（{pose}）'))
    # faces
    b.append(text(24, 628, '顔の決まり（全部の敵で同じ）', 16, 900))
    faces = [('idle', 'ふだん', '待機'), ('attack', 'にらむ', '通常攻撃'), ('big', 'ためる', '大技'), ('guard', 'とじる', '守り'), ('open', 'へとへと', '反撃の隙')]
    pen = Pen('main')
    for i, (k, nm, use_) in enumerate(faces):
        cx = 70 + i * 120
        b.append(f'<circle cx="{cx}" cy="700" r="36" fill="#C9B79C" stroke="{INK}" stroke-width="3"/>')
        b.append(face_fn(pen, k, [(cx - 12, 696), (cx + 12, 696)], 5, (cx, 716, 12), look=-1, sweat=(cx + 26, 668, 9), effort=(cx, 664, 30)))
        b.append(label_plate(cx, 746, nm, 13, use_))
    b.append(text(640, 628, '大技の「危ない影」', 16, 900))
    b.append(S.danger_shadow(730, 704, 100, 18))
    b.append(text(730, 750, '一行の足元に出す（斜線＋点線の縁）', 12, 700, P['ink-2'], 'middle'))
    return svg_doc(W, H, '\n'.join(b), 'telegraph sheet', '見本: 予告の4種類の札・顔・危ない影。最終素材ではない。', icon_defs() + pattern_defs())


@builder('sheet-characters.svg')
def sheet_characters():
    W, H = 900, 700
    b = [rect(0, 0, W, H, fill=P['paper']), sheet_title(24, 40, '勇者と仲間（見本）', '勇者は職で帽子と服だけ変わる。黄色いスカーフ＝自分たち。仲間は形が重ならない4つ。')]
    outfits = [('traveler', '旅人', 'つば広'), ('warrior', '戦士', 'とさか'), ('mage', '魔法使い', 'とんがり'), ('bard', '旅芸人', 'ふたまた')]
    for i, (o, nm, kw) in enumerate(outfits):
        x = 24 + i * 130
        b.append(render(hero(o, 'idle'), 'idle', x, 72, 1.0))
        b.append(label_plate(x + 60, 236, nm, 13, kw))
    poses = [('walk1', '歩く'), ('attack', '攻撃'), ('guard', '防御'), ('cast', '呪文'), ('hit', '受けた'), ('victory', '勝利'), ('down', '倒れた')]
    b.append(text(560, 84, '勇者の姿勢（旅人）', 15, 900))
    for i, (p, nm) in enumerate(poses):
        x = 540 + (i % 4) * 88
        y = 96 + (i // 4) * 150
        b.append(render(hero('traveler', p), p, x, y, .66))
        b.append(text(x + 40, y + 126, nm, 13, 800, INK, 'middle'))
    b.append(text(24, 404, '仲間（待機 → 支援するとき）', 15, 900))
    roles = [('shield', '盾役', 'まるい大盾'), ('medic', '薬師', '背中の薬びん'), ('archer', '攻め役（仮）', 'ほそ長と長い弓'), ('lantern', '支え役（仮）', '頭上の角灯')]
    for i, (r, nm, kw) in enumerate(roles):
        x = 24 + i * 218
        b.append(render(companion(r), 'idle', x, 424, 1.0))
        b.append(render(companion(r, 'support'), 'support', x + 100, 424, 1.0))
        b.append(label_plate(x + 100, 578, nm, 13, kw))
    b.append(text(24, 664, '赤十字（白地に赤い十字）は使わない。回復の印は葉っぱ。', 13, 800, P['ink-2']))
    return svg_doc(W, H, '\n'.join(b), 'characters sheet', '見本: 勇者4職・姿勢・仲間4人。最終素材ではない。', icon_defs() + pattern_defs())


ENEMY_INFO = {
    'EN01': ('野ネズミ剣士', 'まる耳と細い剣'), 'EN02': ('鎧モグラ', '背中の鎧板と大きな爪'), 'EN03': ('浅瀬ガニ', '左右の大ばさみ'),
    'EN04': ('灯りコウモリ', '広い翼としっぽの灯'), 'EN05': ('磁石ゴーレム', 'U字磁石の頭と太い腕'), 'EN06': ('霧ギツネ', 'ふさふさの大きな尾'),
    'EN07': ('茨グモ', '八本脚と背中のとげ'), 'EN08': ('城壁ガーゴイル', '石の翼と角'), 'EN09': ('草盾タヌキ', 'まるいおなかと草の盾'),
    'EN10': ('水車カワウソ', '長い胴と水車'), 'EN11': ('鉱灯ヤドカリ', '鉱石の殻と灯'), 'EN12': ('霧鈴フクロウ', '丸い顔の皿と首の鈴'),
    'EN13': ('城壁槍コボルト', 'とがり耳と長い槍')}


@builder('sheet-enemies.svg')
def sheet_enemies():
    poses = [('idle', '待機'), ('attack', '通常攻撃'), ('big', '大技'), ('guard', '守り'), ('open', '反撃の隙')]
    W, rowh = 920, 132
    H = 96 + rowh * 13 + 20
    b = [rect(0, 0, W, H, fill=P['paper']), sheet_title(24, 40, '通常の敵13種と4つの構え（見本）', '看板の姿勢＝予告の文（正本）に書かれた構え（指示書4.5の表の太字）。全員が4種類すべての姿勢を持つ。')]
    for j, (p, nm) in enumerate(poses):
        b.append(text(230 + j * 138, 86, nm, 14, 900, INK, 'middle'))
    for i, (k, fn) in enumerate(ENEMIES.items()):
        y = 96 + i * rowh
        if i % 2 == 0:
            b.append(rect(8, y, W - 16, rowh, 10, fill='#F1E6CD'))
        nm, kw = ENEMY_INFO[k]
        b.append(text(20, y + 52, k, 13, 900, P['ink-2']) + text(20, y + 74, nm, 15, 900) + text(20, y + 94, kw, 12, 700, P['ink-2']))
        for j, (p, _) in enumerate(poses):
            b.append(render(fn(p), p, 168 + j * 138, y + 6, .62))
    return svg_doc(W, H, '\n'.join(b), 'enemies sheet', '見本: 通常の敵13種×待機・通常攻撃・大技・守り・反撃の隙。最終素材ではない。', icon_defs() + pattern_defs())


@builder('sheet-bosses.svg')
def sheet_bosses():
    W, H = 940, 1010
    b = [rect(0, 0, W, H, fill=P['paper']), sheet_title(24, 40, '強敵と魔王（見本）', '行動名は balance-draft-2。大技はいちばん大きく形が変わる。')]
    rows = [('MB01 石門番', mb01, [('idle', '待機'), ('attack', '石腕の打撃'), ('big', '石腕の大振り（大技）'), ('open', '腕を戻す（すき）')]),
            ('MB02 鉄甲虫', mb02, [('guard', '殻を閉じる（守り）'), ('attack', '殻を開いて打つ'), ('big', '閉殻の突進（大技）'), ('open', '殻が開く（すき）')]),
            ('MB03 霧狼', mb03, [('idle', '待機（足跡＝本体）'), ('attack', '霧の爪'), ('big', '影走りの飛びかかり（大技）'), ('open', '足を止める（すき）')])]
    y = 70
    for nm, fn, ps in rows:
        b.append(text(24, y + 20, nm, 16, 900))
        for j, (p, lb) in enumerate(ps):
            b.append(render(fn(p), p, 20 + j * 228, y + 26, .72))
            b.append(text(20 + j * 228 + 94, y + 222, lb, 13, 800, INK, 'middle'))
        y += 236
    b.append(text(24, y + 20, 'DK01 魔王（前半 → 王冠が割れる → 後半）', 16, 900))
    ks = [('p1-idle', '前半・待機'), ('p1-attack', '王の剣'), ('p1-big', '王の強斬（大技）'), ('p1-open', '剣を戻す（すき）'),
          ('crack', '王冠が割れる'), ('p2-attack', '魔剣の波'), ('p2-big', '玉座の一撃（大技）'), ('p2-open', '王冠の隙（すき）')]
    for j, (p, lb) in enumerate(ks):
        x = 14 + j * 114
        b.append(render(dk01(p), p, x, y + 40, .38))
        b.append(text(x + 57, y + 172, lb, 12, 800, INK, 'middle'))
    return svg_doc(W, H, '\n'.join(b), 'bosses sheet', '見本: 強敵3種と魔王の前半・王冠・後半。最終素材ではない。', icon_defs() + pattern_defs())


# ================================================================ SCREENS (option A)
def board_top(b, W):
    chipsvg, cw = route_chip(16, 70, 'M', '金貨の商人道')
    b.append(chipsvg)
    b.append(text(16 + cw + 12, 84, '第1区間', 13, 700, P['ink-2']) + text(16 + cw + 12, 104, '草原の門出', 16, 800))
    b.append(text(334, 104, '4/100', 14, 800, P['ink-2'], 'end'))
    b.append(icon_button(342, 66, 'i-cog'))
    b.append(status_card(16, 116, 370, 32, 40, 8, 10, 200, 1, '旅人'))


def board_scene(b, W, ring=None, ghost=None):
    y0, sh = 170, 420
    b += S.board_scene_band1(0, y0, W, sh)
    road = [(200, 610), (200, 538), (300, 494), (336, 428), (250, 392), (156, 356), (96, 306), (158, 276), (226, 262)]
    d = S.smooth(road)
    b.append(f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>'
             f'<path d="{d}" fill="none" stroke="#E9D3A2" stroke-width="35" stroke-linecap="round" stroke-linejoin="round"/>'
             f'<path d="{d}" fill="none" stroke="#D2B47A" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>'
             f'<path d="{d}" fill="none" stroke="#E9D3A2" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>')
    b.append(S.grass_tufts([(30, 520), (64, 572), (120, 470), (352, 566), (380, 470), (112, 424), (300, 566), (20, 470)]))
    b.append(S.flowers([(44, 540), (72, 516), (340, 584), (368, 540), (128, 584), (382, 432)]))
    b.append(S.stall(14, 400))
    b.append(S.signpost(374, 376, 'M'))
    tiles = [((158, 276), 40, '金貨', None, True), ((96, 306), 44, '金貨', None, True), ((156, 356), 64, '宿場', 4, False),
             ((250, 392), 52, '道具', 3, False), ((336, 428), 56, '金貨', 2, False), ((300, 494), 62, '装備', 1, False)]
    for (cx, cy), s, k, st, fd in tiles:
        b.append(S.tile(cx, cy, s, k, step=st, faded=fd, treasure=(st == 1), inn_flag=(k == '宿場'), ring=(st == ring)))
        if ghost is not None and st == ghost:
            b.append(f'<circle cx="{cx}" cy="{cy}" r="{s * .74:.0f}" fill="none" stroke="{P["ink-3"]}" stroke-width="2" stroke-dasharray="3 5"/>')
    b.append(S.tile(200, 538, 80, '道具'))
    b.append('<ellipse cx="200" cy="540" rx="22" ry="6" fill="rgba(42,30,22,.25)"/>')
    b.append(render(hero('traveler', 'idle'), 'idle', 200 - 60 * .5, 538 - 152 * .5, .5))
    b.append(card(16, 552, 150, 30, 15) + f'<circle cx="32" cy="567" r="11" fill="{P["act"]}" stroke="{INK}" stroke-width="2"/>'
             + text(32, 572, '4', 14, 900, INK, 'middle') + text(48, 573, 'ひっくり返る的', 14, 800))
    b.append('</g>')
    b.append(f'<path d="M0 {y0}H{W}M0 {y0 + sh}H{W}" stroke="{INK}" stroke-width="2.5"/>')


def board_strip(b, ring=None):
    b.append(text(16, 612, 'つぎの6マス', 14, 800, P['ink-2']))
    b.append(use('i-inn', 262, 597, 20) + text(386, 612, '宿まで あと4', 14, 800, INK, 'end'))
    kinds = ['装備', '金貨', '道具', '宿場', '金貨', '金貨']
    cw_, gap = 56, (370 - 6 * 56) / 5
    for i, k in enumerate(kinds):
        cx = 16 + i * (cw_ + gap)
        b.append(S.strip_card(cx, 620, cw_, 72, i + 1, k, faded=i >= 4, emph=(i == 3), ring=(ring == i + 1)))
    b.append(use('i-chest', 16 + 56 - 16, 612, 20))


@builder('s02-board.svg')
def s02_board():
    """After rolling: raw 2, compass preview +1 -> 3. Number and landing ring change together (R42)."""
    W, H = 402, 874
    b = [rect(0, 0, W, H, fill=P['paper'])]
    board_top(b, W)
    board_scene(b, W, ring=3, ghost=2)
    board_strip(b, ring=3)
    b.append(card(16, 704, 370, 30, 10, fill='#FFFDF6') + use('i-item', 24, 707, 22)
             + text(52, 725, '着地：7番 はねた豆の行き先（道具）', 14, 800))
    # dock: die + compass + go
    b.append(die_face(16, 744, 62, 3) + text(47, 826, '2 → 3', 14, 800, P['ink-2'], 'middle'))
    b.append(plaque(90, 748, 66, 56, '−1', None, primary=False, size=20))
    b.append(plaque(164, 748, 66, 56, '+1', None, primary=False, size=20, face='#F7D57F'))
    b.append(text(160, 826, 'コンパス：進むで1個使う', 12, 700, P['ink-2'], 'middle'))
    b.append(plaque(240, 744, 146, 64, '進む', 'i-run', primary=True, size=20))
    b.append(f'<g transform="translate(276 776) scale(-1 1)"></g>')
    b.append(annot(222, 380, '1') + annot(86, 652, '2') + annot(28, 744, '3'))
    b.append(phone_chrome(W, H, '見本S02・最終素材ではない'))
    return svg_doc(W, H, '\n'.join(b), 'S02 board after roll',
                   '見本S02: 振った後。素の目2をコンパスで+1→3。目の数字と着地点の輪が同時に変わる。①仮の着地点の輪（元の着地点は細い点線）②帯のカードにも輪 ③目と調整。最終素材ではない。',
                   icon_defs() + pattern_defs())


def blocked_badge(x, y, label):
    w = tw(label, 14) + 40
    return (f'<g class="num-block"><path d="M{x} {y}h{w}v22l-{w / 2} 10l-{w / 2} -10z" fill="{P["num-block"]}" stroke="{INK}" stroke-width="2" stroke-linejoin="round"/>'
            + use('i-shield', x + 5, y + 3, 20) + text(x + 29, y + 18, label, 14, 800, '#fff') + '</g>')


@builder('s04-battle.svg')
def s04_battle():
    """Right after the enemy's big attack: reduced amounts (blue shields, no minus) vs taken (−7 by the HP bar),
    the log keeps the breakdown, and the next telegraph (反撃の隙) has dropped in."""
    W, H = 402, 874
    b = [rect(0, 0, W, H, fill=P['paper'])]
    b.append(card(16, 66, 370, 40, 12))
    b.append(text(28, 92, '石門番', 18, 800))
    b.append(rect(90, 76, 46, 22, 11, fill=INK) + text(113, 92, '強敵', 13, 800, P['cut'], 'middle'))
    b.append(text(150, 92, '体力', 13, 700, P['ink-2']))
    b.append(bar(180, 80, 150, 13, 52 / 70, P['foe-hp'], P['foe-hp-track']))
    b.append(text(376, 92, '52/70', 14, 800, INK, 'end'))
    y0, sh = 112, 330
    b.append(S.mine_backdrop(0, y0, W, sh))
    b.append(render(mb01('open'), 'open', 186, 436 - 246 * .82, .82))
    b.append(render(companion('medic'), 'idle', 2, 432 - 134 * .62, .62))
    b.append(render(companion('shield', 'support'), 'support', 46, 432 - 134 * .62, .62))
    b.append(render(hero('warrior', 'guard'), 'guard', 104, 432 - 152 * .72, .72))
    tag, th = S.telegraph_tag(14, 128, 196, '反撃の隙', '腕を戻す', '腕を戻す手は攻撃が来ず、防御も下がる。', 0, 9, string_top=y0)
    b.append(tag)
    b.append(blocked_badge(178, 338, '防御 12'))
    b.append(blocked_badge(110, 374, '盾役 5'))
    b.append('</g>')
    b.append(f'<path d="M0 {y0}H{W}M0 {y0 + sh}H{W}" stroke="{INK}" stroke-width="2.5"/>')
    # party board with taken amount
    b.append(card(16, 450, 370, 92, 12))
    b.append(use('i-heart', 26, 459, 20) + text(50, 474, '体力', 13, 700, P['ink-2'])
             + bar(84, 462, 186, 15, 34 / 52, P['hp'], P['hp-track'], ghost=41 / 52) + text(376, 477, '34/52', 22, 900, INK, 'end'))
    b.append(text_outline(300, 446, '−7', 32, P['num-dmg'], P['cut'], 5))
    b.append(text(330, 444, '体力', 13, 800, P['num-dmg']))
    b.append(use('i-drop', 26, 484, 18) + text(50, 498, '魔力', 13, 700, P['ink-2'])
             + bar(84, 488, 120, 10, 14 / 22, P['mp'], P['mp-track']) + text(260, 499, '14/22', 16, 800, INK, 'end'))
    b.append(f'<path d="M26 508H376" stroke="{INK}" stroke-width="1.2" opacity=".3"/>')
    b.append(face_badge(40, 525, 14, 'shield') + text(60, 522, '盾役', 12, 800, P['ink-2']) + text(60, 537, '大技の前に かばう', 13, 800)
             + rect(170, 513, 34, 18, 9, fill=P['ink-3']) + text(187, 526, '使った', 10, 800, '#fff', 'middle'))
    b.append(face_badge(212, 525, 14, 'medic') + text(232, 522, '薬師', 12, 800, P['ink-2']) + text(232, 537, '体力半分以下で 回復', 13, 800))
    b.append(card(16, 550, 370, 52, 10, fill='#FFFDF6'))
    b.append(text(28, 571, '石門番の 石腕の大振り。防御で 12、盾役が 5', 14, 700))
    b.append(text(28, 591, 'ふせいだ。体力 −7（41 → 34）', 14, 700))
    bw, bh = 181, 74
    b.append(plaque(16, 612, bw, bh, '攻撃', 'i-sword'))
    b.append(plaque(16 + bw + 8, 612, bw, bh, '防御', 'i-shield'))
    b.append(plaque(16, 612 + bh + 10, bw, bh, '呪文', 'i-spell', sub='魔力を使う'))
    b.append(plaque(16 + bw + 8, 612 + bh + 10, bw, bh, '道具', 'i-bag', sub='袋 3こ'))
    b.append(plaque(16, 786, 150, 44, '逃げる', 'i-run', primary=False, size=16, disabled=True))
    b.append(seg_toggle(186, 786, 200, 44, ['標準', '短縮'], 0))
    b.append(annot(280, 350, '1') + annot(354, 430, '2') + annot(372, 566, '3') + annot(200, 140, '4'))
    b.append(phone_chrome(W, H, '見本S04・最終素材ではない'))
    return svg_doc(W, H, '\n'.join(b), 'S04 battle numbers',
                   '見本S04: 大技を防御と盾役で受けた直後。①防いだ量は青い盾形の札（マイナスなし、軽くした順に1枚ずつ）②受けた量は体力の横に大きく−7（失った分を薄く残す）③結果の帯に内訳を文で残す ④次の予告（すき）。最終素材ではない。',
                   icon_defs() + pattern_defs())


def shop_card(x, y, w, h, icon, name, price, cls, scene, selected=False, short=None):
    o = [card(x, y, w, h, 12)]
    if selected:
        o.append(f'<rect x="{x - 4}" y="{y - 4}" width="{w + 8}" height="{h + 8}" rx="15" fill="none" stroke="{P["act-edge"]}" stroke-width="4"/>')
    op = ' opacity=".5"' if short else ''
    o.append(f'<g{op}>' + use(icon, x + 10, y + 12, 40) + text(x + 58, y + 30, name, 15, 800) + chip(x + 58, y + 40, cls, P['paper-deep'], size=12, h=22)[0]
             + text(x + 10, y + 86, f'{price}G', 22, 900) + text(x + 10 + tw(f'{price}G', 22) + 4, y + 86, '／1こ', 12, 700, P['ink-2'])
             + text(x + 10, y + h - 12, scene, 12, 700, P['ink-2']) + '</g>')
    if short:
        o.append(rect(x + w - 92, y + 66, 84, 26, 13, fill=P['num-dmg']) + text(x + w - 50, y + 84, short, 13, 800, '#fff', 'middle'))
    return ''.join(o)


@builder('s05-inn-shop.svg')
def s05_inn_shop():
    W, H = 402, 874
    b = [rect(0, 0, W, H, fill=P['paper'])]
    b.append(use('i-inn', 16, 68, 34) + text(58, 86, '水時計の船宿', 18, 900) + text(58, 104, '第2区間・25番', 13, 700, P['ink-2']))
    b.append(icon_button(342, 66, 'i-cog'))
    tabs = ['休憩', '売店', '転職', '酒場']
    for i, t in enumerate(tabs):
        x = 16 + i * 94
        f = P['act'] if t == '売店' else P['wood']
        b.append(rect(x, 119, 86, 40, 10, fill=P['act-edge'] if t == '売店' else P['wood-edge'], stroke=INK, sw=2)
                 + rect(x, 116, 86, 40, 10, fill=f, stroke=INK, sw=2) + text(x + 43, 142, t, 16, 800, INK, 'middle'))
    # wallet
    b.append(card(16, 170, 370, 64, 14))
    b.append(use('i-coin', 26, 180, 42) + text(76, 194, '所持金', 13, 800, P['ink-2']) + text(76, 224, '850G', 32, 900))
    b.append(use('i-bag', 280, 186, 30) + text(316, 208, '袋 4/6', 16, 800))
    b.append(annot(200, 202, '1'))
    # shelf
    b.append(text(16, 256, '定番', 13, 900, P['ink-2']))
    b.append(shop_card(16, 264, 181, 124, 'i-heal', '薬草', 20, '回復用', '戦闘・宿・城門で使う'))
    b.append(shop_card(205, 264, 181, 124, 'd-5', '旅のコンパス', 30, 'すごろく用', '振った後に ±1'))
    b.append(text(16, 410, 'この地方', 13, 900, P['ink-2']))
    b.append(shop_card(16, 418, 181, 124, 'i-book', '露の手当て', 600, '呪文書', '体力を戻す呪文', selected=True))
    b.append(shop_card(205, 418, 181, 124, 'i-shield', 'うず潮のよろい', 920, '防具', '防御 +8', short='あと 70G'))
    b.append(annot(104, 506, '2') + annot(376, 470, '4'))
    # receipt
    b.append(card(16, 556, 370, 138, 14, fill='#FFFDF6'))
    b.append(use('i-book', 26, 566, 26) + text(58, 586, '露の手当て ×1', 16, 800) + chip(190, 568, '呪文書', P['paper-deep'], size=12, h=22)[0])
    b.append(text(26, 634, '850G', 28, 900) + text(110, 634, '−', 28, 900) + text(134, 634, '600G', 28, 900) + text(218, 634, '＝', 26, 900))
    b.append(rect(246, 602, 132, 44, 10, fill=P['act'], stroke=INK, sw=2) + text(258, 619, 'のこり', 12, 800, INK) + text(370, 638, '250G', 24, 900, INK, 'end'))
    b.append(text(26, 672, '呪文書は 袋に入らない（袋 4/6 のまま）', 14, 800, P['ink-2']))
    b.append(annot(372, 600, '3'))
    b.append(plaque(16, 708, 370, 62, '600G で 買う', 'i-coin', primary=True, size=20))
    b.append(plaque(16, 786, 140, 44, 'やめる', None, primary=False, size=16))
    b.append(plaque(166, 786, 220, 44, '宿にもどる', 'i-inn', primary=False, size=16))
    b.append(phone_chrome(W, H, '見本S05・最終素材ではない'))
    return svg_doc(W, H, '\n'.join(b), 'S05 inn shop',
                   '見本S05: 売店。主役は所持金・単価・差額。①財布 ②単価（1こ当たり）③差額の式と「のこり」④足りない品は「あと70G」。最終素材ではない。',
                   icon_defs() + pattern_defs())


def equip_card(x, y, w, h, title, name, stat, effect_lines, icon):
    o = [card(x, y, w, h, 12), rect(x, y, w, 28, 12, fill=P['paper-deep']), f'<path d="M{x} {y + 28}H{x + w}" stroke="{INK}" stroke-width="2"/>',
         text(x + w / 2, y + 20, title, 14, 900, INK, 'middle'), use(icon, x + w / 2 - 22, y + 36, 44),
         text(x + w / 2, y + 102, name, 14, 800, INK, 'middle'), text(x + w / 2, y + 124, stat, 16, 900, INK, 'middle')]
    for i, ln in enumerate(effect_lines):
        o.append(text(x + 10, y + 148 + i * 18, ln, 12, 700, P['ink-2']))
    return ''.join(o)


@builder('s08-equipment.svg')
def s08_equipment():
    W, H = 402, 874
    b = [rect(0, 0, W, H, fill=P['paper'])]
    b.append(plaque(16, 66, 92, 44, 'もどる', None, primary=False, size=16) + text(124, 96, 'ステータス・装備', 18, 900))
    b.append(icon_button(342, 66, 'i-cog'))
    # hero card
    b.append(card(16, 124, 370, 126, 14))
    b.append(render(hero('traveler', 'idle'), 'idle', 20, 128, .74))
    rows = [('Lv', '2　旅人'), ('体力', '30 / 42'), ('魔力', '9 / 12'), ('攻撃', '9'), ('防御', '7')]
    for i, (k, v) in enumerate(rows):
        b.append(text(122, 150 + i * 21, k, 13, 800, P['ink-2']) + text(176, 150 + i * 21, v, 16, 900))
    b.append(text(270, 150, '仲間', 13, 800, P['ink-2']) + face_badge(290, 178, 16, 'shield') + face_badge(330, 178, 16, 'medic'))
    # slots
    b.append(card(16, 262, 181, 70, 12) + use('i-sword', 26, 274, 30) + text(64, 290, '剣', 12, 800, P['ink-2']) + text(64, 310, '旅立ちの剣', 14, 800) + text(64, 326, '攻撃 +1', 12, 800, P['ink-2']))
    b.append(f'<rect x="12" y="258" width="189" height="78" rx="15" fill="none" stroke="{P["act-edge"]}" stroke-width="4"/>')
    b.append(card(205, 262, 181, 70, 12) + use('i-shield', 215, 274, 30) + text(253, 290, '防具', 12, 800, P['ink-2']) + text(253, 310, '旅人の服', 14, 800) + text(253, 326, '防御 +1', 12, 800, P['ink-2']))
    # compare
    b.append(text(16, 364, 'くらべる：剣', 16, 900))
    b.append(equip_card(16, 376, 160, 220, 'いま', '旅立ちの剣', '攻撃 +1', ['追加の効果はない'], 'i-sword'))
    b.append(equip_card(226, 376, 160, 220, 'これ', 'つばめの二また剣', '攻撃 +3', ['2回続けて通常攻撃を', '当てたとき、2回目に', '+4（1戦1回）'], 'i-sword'))
    b.append(f'<path d="M184 470h30l-8 -8M214 470l-8 8" fill="none" stroke="{INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>')
    # diff rows
    b.append(card(16, 608, 370, 92, 14, fill='#FFFDF6'))
    b.append(text(28, 646, '攻撃', 16, 900) + text(90, 648, '9', 30, 900) + text(126, 648, '→', 26, 900) + text(164, 648, '11', 30, 900)
             + f'<path d="M216 636l8 -12 8 12z" fill="{P["num-heal"]}"/>' + text(236, 648, '+2', 26, 900, P['num-heal']))
    b.append(text(28, 684, '防御', 14, 800, P['ink-2']) + text(90, 686, '7 → 7（変わらない）', 16, 800, P['ink-2']))
    b.append(annot(372, 640, '1') + annot(372, 380, '2'))
    b.append(plaque(16, 716, 370, 62, '付け替える', 'i-sword', primary=True, size=20))
    b.append(plaque(16, 790, 370, 40, 'やめる', None, primary=False, size=16))
    b.append(phone_chrome(W, H, '見本S08・最終素材ではない'))
    return svg_doc(W, H, '\n'.join(b), 'S08 equipment compare',
                   '見本S08: 装備の比べ。①差を大きく「攻撃 9 → 11（+2）」②効果といつ効くかの文。最終素材ではない。',
                   icon_defs() + pattern_defs())


def dusk_card(x, y, w, h, rx=12):
    return rect(x, y + 3, w, h, rx, fill='rgba(0,0,0,.45)') + rect(x, y, w, h, rx, fill=P['dusk-card'], stroke=P['dusk-line'], sw=2)


@builder('s10-gate.svg')
def s10_gate():
    W, H = 402, 874
    b = [f'<defs><linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A2336"/><stop offset="1" stop-color="#4A3A5C"/></linearGradient></defs>',
         rect(0, 0, W, H, fill=P['dusk-paper']), rect(0, 62, W, 470, fill='url(#night)')]
    b.append(''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#F5EBD8" opacity=".7"/>' for x, y, r in [(40, 90, 1.6), (90, 130, 1.2), (330, 100, 1.8), (370, 160, 1.2), (250, 84, 1.2)]))
    b.append(S.castle(201, 470, 2.25, color='#3B2F4A', windows=True, outline=True))
    b.append(f'<path d="M150 470h102l26 40H124z" fill="#6E6380" stroke="{INK}" stroke-width="2.5" stroke-linejoin="round"/>'
             f'<path d="M110 510h182l18 22H92z" fill="#5E5470" stroke="{INK}" stroke-width="2.5" stroke-linejoin="round"/>')
    b.append(use('i-bell', 181, 300, 40))
    b.append(f'<path d="M168 312a20 20 0 0 0 0 26M160 306a30 30 0 0 0 0 38M234 312a20 20 0 0 1 0 26M242 306a30 30 0 0 1 0 38" fill="none" stroke="#F4C35A" stroke-width="2" opacity=".8"/>')
    b.append(render(hero('warrior', 'idle'), 'idle', 201 - 60 * .5, 520 - 152 * .5, .5))
    # castle name ribbon
    b.append(f'<path d="M40 104h322l-14 22 14 22H40l14 -22z" fill="{P["gold"]}" stroke="{INK}" stroke-width="2.5" stroke-linejoin="round"/>'
             + text(201, 134, '魔王城・王冠の間', 22, 900, INK, 'middle'))
    b.append(rect(150, 158, 102, 26, 13, fill=P['dusk-card'], stroke=P['gold'], sw=2) + text(201, 176, '到達 100', 14, 900, P['dusk-text'], 'middle'))
    b.append(annot(258, 320, '1') + annot(372, 126, '2'))
    # prep
    b.append(dusk_card(16, 540, 370, 48, 12))
    b.append(use('i-heart', 26, 549, 20) + text(50, 565, '体力', 13, 700, P['dusk-text-2']) + bar(84, 552, 160, 13, 44 / 56, P['hp'], P['hp-track'], ink=P['dusk-line'])
             + text(316, 567, '44/56', 18, 900, P['dusk-text'], 'end') + use('i-drop', 326, 551, 16) + text(380, 567, '18/24', 13, 800, P['dusk-text-2'], 'end'))
    bw = 181
    b.append(plaque(16, 598, bw, 56, '装備・呪文', 'i-gear', primary=False, size=16))
    b.append(plaque(16 + bw + 8, 598, bw, 56, '薬草を使う', 'i-heal', primary=False, size=16))
    b.append(plaque(16, 664, bw, 56, '仲間を見る', 'i-star', primary=False, size=16))
    b.append(plaque(16 + bw + 8, 664, bw, 56, '道具袋', 'i-bag', primary=False, size=16))
    b.append(text(201, 748, 'にげられない戦い。準備ができたら挑む', 14, 800, P['dusk-text-2'], 'middle'))
    b.append(plaque(16, 760, 370, 66, '魔王に挑む', 'i-crown', primary=True, size=22))
    b.append(annot(30, 792, '3'))
    b.append(phone_chrome(W, H, '見本S10・最終素材ではない', dark=True))
    return svg_doc(W, H, '\n'.join(b), 'S10 castle gate',
                   '見本S10: 城門（夕暮れの色）。足音が止まる→静けさ→①鐘1回→②城名→③挑戦ボタン。木札の黄色は夕暮れでも変えない。最終素材ではない。',
                   icon_defs() + pattern_defs())


@builder('s10-crown-break.svg')
def s10_crown_break():
    W, H = 402, 874
    b = [rect(0, 0, W, H, fill=P['dusk-paper'])]
    b.append(dusk_card(16, 66, 370, 40, 12))
    b.append(text(28, 92, '魔王', 18, 900, P['dusk-text']) + rect(74, 76, 46, 22, 11, fill=P['gold']) + text(97, 92, '決戦', 13, 900, INK, 'middle'))
    b.append(text(132, 92, '体力', 13, 700, P['dusk-text-2']) + bar(162, 80, 160, 13, 61 / 124, P['foe-hp'], P['foe-hp-track'], ink=P['dusk-line']))
    b.append(use('i-crown', 162 + 80 - 9, 66, 18) + f'<path d="M242 80v13" stroke="{P["gold"]}" stroke-width="2.5"/>')
    b.append(text(380, 92, '61/124', 13, 800, P['dusk-text'], 'end'))
    y0, sh = 112, 330
    b.append(f'<defs><clipPath id="throne-clip"><rect x="0" y="{y0}" width="{W}" height="{sh}"/></clipPath>'
             f'<linearGradient id="throne" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3A2D4E"/><stop offset="1" stop-color="#5A4470"/></linearGradient></defs>'
             f'<g clip-path="url(#throne-clip)">' + rect(0, y0, W, sh, fill='url(#throne)')
             + ''.join(rect(x, y0, 34, sh, 4, fill='#4A3B60', stroke=P['dusk-line'], sw=2) for x in (14, 354))
             + f'<path d="M150 {y0 + sh}L190 {y0 + 140}H230L270 {y0 + sh}Z" fill="#8E2A3A" opacity=".8"/>'
             + rect(0, y0 + sh - 50, W, 50, fill='#3B2F4A'))
    b.append(render(dk01('crack'), 'crack', 160, 440 - 286 * .78, .78))
    b.append(render(hero('warrior', 'idle'), 'idle', 26, 436 - 152 * .62, .62))
    b.append(render(companion('shield'), 'idle', 94, 436 - 134 * .5, .5))
    # crown banner (NOT a paper tag): gold crown-shaped ribbon
    b.append(f'<path d="M30 132l20 -16 20 14 22 -18 22 14 22 -18 22 14 22 -18 22 14 22 -18 22 14 20 -16 v70 H30z" fill="{P["gold"]}" stroke="{INK}" stroke-width="2.5" stroke-linejoin="round"/>'
             + text(201, 166, '王冠が割れた！', 24, 900, INK, 'middle') + text(201, 188, '次の手から 後半', 15, 800, INK, 'middle'))
    # current telegraph kept (small)
    tag, th = S.telegraph_tag(14, 214, 150, '通常攻撃', '王の剣', '剣を前上へ振りかぶる。', 42, 21, string_top=200)
    b.append(tag)
    b.append(rect(14, 214 + th + 6, 150, 22, 11, fill=P['dusk-card'], stroke=P['gold'], sw=1.5) + text(89, 214 + th + 21, 'この手は 予告どおり', 12, 800, P['dusk-text'], 'middle'))
    b.append('</g>')
    b.append(f'<path d="M0 {y0}H{W}M0 {y0 + sh}H{W}" stroke="{P["dusk-line"]}" stroke-width="2.5"/>')
    b.append(dusk_card(16, 450, 370, 56, 12))
    b.append(use('i-heart', 26, 461, 20) + text(50, 476, '体力', 13, 700, P['dusk-text-2']) + bar(84, 464, 186, 15, 30 / 56, P['hp'], P['hp-track'], ink=P['dusk-line'])
             + text(376, 479, '30/56', 22, 900, P['dusk-text'], 'end'))
    b.append(use('i-drop', 26, 484, 16) + text(50, 497, '魔力', 12, 700, P['dusk-text-2']) + text(84, 498, '12/24', 14, 800, P['dusk-text']))
    b.append(dusk_card(16, 514, 370, 34, 10) + text(28, 537, '王冠にひびが入った。いまの手は 予告どおり。', 14, 800, P['dusk-text']))
    bw, bh = 181, 74
    b.append(f'<g opacity=".45">' + plaque(16, 558, bw, bh, '攻撃', 'i-sword') + plaque(16 + bw + 8, 558, bw, bh, '防御', 'i-shield')
             + plaque(16, 558 + bh + 10, bw, bh, '呪文', 'i-spell', sub='魔力を使う') + plaque(16 + bw + 8, 558 + bh + 10, bw, bh, '道具', 'i-bag', sub='袋 2こ') + '</g>')
    b.append(text(201, 748, '止まっている間（0.45秒）は押せない', 13, 800, P['dusk-text-2'], 'middle'))
    b.append(seg_toggle(186, 770, 200, 44, ['標準', '短縮'], 0))
    b.append(annot(372, 150, '1') + annot(232, 70, '2') + annot(178, 300, '3') + annot(200, 734, '4'))
    b.append(phone_chrome(W, H, '見本S10・最終素材ではない', dark=True))
    return svg_doc(W, H, '\n'.join(b), 'S10 crown break',
                   '見本S10: 王冠が割れた瞬間。①予告の札とは違う金色の王冠の形の帯 ②体力ゲージの半分に王冠の印 ③いまの予告は残る「この手は予告どおり」④止まっている間は操作できない。音は高いガラスのひび（予告の低音と別）。最終素材ではない。',
                   icon_defs() + pattern_defs())


def mini_map(x, y, w, h, inns, lit_to=100, current=None):
    """Serpentine 10x10 map drawn by code (S11 / full map)."""
    o = [card(x, y, w, h, 12)]
    cols, rows = 10, 10
    cw_, ch_ = (w - 24) / cols, (h - 24) / rows
    band_cols = ['#E4F0D2', '#DDEBEA', '#EFE2C8', '#DEE3DF', '#EEDCCB']
    pts = []
    for n in range(1, 101):
        r = (n - 1) // cols
        c = (n - 1) % cols
        if r % 2 == 1:
            c = cols - 1 - c
        px = x + 12 + c * cw_ + cw_ / 2
        py = y + h - 12 - r * ch_ - ch_ / 2
        pts.append((px, py))
    for bi in range(5):
        o.append(rect(x + 8, y + h - 12 - (bi + 1) * 2 * ch_, w - 16, 2 * ch_, 6, fill=band_cols[bi]))
    d = 'M' + ' L'.join(f'{px:.1f} {py:.1f}' for px, py in pts)
    o.append(f'<path d="{d}" fill="none" stroke="{P["route-M"]}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>')
    lit = 'M' + ' L'.join(f'{px:.1f} {py:.1f}' for px, py in pts[:lit_to])
    o.append(f'<path d="{lit}" fill="none" stroke="{P["act"]}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>')
    for n, (px, py) in enumerate(pts, 1):
        if n in inns:
            o.append(use('i-inn', px - 10, py - 11, 20))
        elif n == 1:
            o.append(use('i-start', px - 9, py - 10, 18))
        elif n == 100:
            o.append(use('i-castle', px - 13, py - 16, 26))
        elif n % 5 == 0:
            o.append(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="2.6" fill="{INK}"/>')
    return ''.join(o)


@builder('s11-result.svg')
def s11_result():
    W, H = 402, 874
    b = [rect(0, 0, W, H, fill=P['paper'])]
    b.append(text(26, 112, '魔王を たおした！', 30, 900))
    b.append(f'<circle cx="340" cy="96" r="34" fill="#A3283A" stroke="{INK}" stroke-width="2.5"/><circle cx="340" cy="96" r="27" fill="none" stroke="#F5EBD8" stroke-width="2"/>'
             + text(340, 104, '討伐', 20, 900, '#F5EBD8', 'middle'))
    b.append(mini_map(16, 140, 370, 230, inns={8, 25, 47, 64, 82}))
    b.append(annot(372, 160, '1'))
    b.append(card(16, 384, 370, 176, 14))
    chipsvg, cw = route_chip(28, 396, 'M', '金貨の商人道')
    b.append(chipsvg)
    stats = [('到達', '100'), ('振った回数', '23回'), ('最後の職', '戦士 Lv9')]
    for i, (k, v) in enumerate(stats):
        x = 28 + i * 120
        b.append(text(x, 456, k, 13, 800, P['ink-2']) + text(x, 484, v, 22, 900))
    b.append(text(28, 520, '仲間', 13, 800, P['ink-2']) + face_badge(84, 515, 17, 'shield') + text(108, 520, '盾役', 14, 800)
             + face_badge(170, 515, 17, 'medic') + text(194, 520, '薬師', 14, 800))
    b.append(f'<path d="M16 572h370l-12 16 12 16H16l12 -16z" fill="{P["act"]}" stroke="{INK}" stroke-width="2.5" stroke-linejoin="round"/>'
             + use('i-star', 120, 576, 24) + text(150, 596, '自己ベスト更新！', 18, 900))
    b.append(annot(372, 588, '2'))
    b.append(card(16, 616, 370, 50, 12) + use('i-book', 26, 627, 28) + text(62, 646, 'はじめて見つけた　敵 2・装備 5', 15, 800)
             + rect(312, 630, 60, 22, 11, fill=P['tell-big']) + text(342, 646, 'NEW', 12, 900, '#fff', 'middle'))
    b.append(plaque(16, 680, 370, 62, 'もう一度 旅に出る', 'i-retry', primary=True, size=20))
    bw = (370 - 16) / 3
    b.append(plaque(16, 756, bw, 48, '図鑑', 'i-book', primary=False, size=16))
    b.append(plaque(16 + bw + 8, 756, bw, 48, 'ホーム', 'i-start', primary=False, size=16))
    b.append(rect(16 + 2 * (bw + 8), 756, bw, 48, 12, fill='#000') + text(16 + 2 * (bw + 8) + bw / 2, 786, 'Xでシェア', 16, 800, '#fff', 'middle'))
    b.append(text(201, 826, 'Xでシェアは公開版（T08）で有効', 12, 700, P['ink-2'], 'middle'))
    b.append(phone_chrome(W, H, '見本S11・最終素材ではない'))
    return svg_doc(W, H, '\n'.join(b), 'S11 result',
                   '見本S11: 討伐の結果。①1番から城まで道が灯る地図（コードで描く）②自己ベストは保存が成った後に1回。最終素材ではない。',
                   icon_defs() + pattern_defs())


if __name__ == '__main__':
    names = sys.argv[1:] or list(BUILDERS)
    for n in names:
        write(n, BUILDERS[n]())
