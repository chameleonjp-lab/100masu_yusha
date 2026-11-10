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


if __name__ == '__main__':
    names = sys.argv[1:] or list(BUILDERS)
    for n in names:
        write(n, BUILDERS[n]())
