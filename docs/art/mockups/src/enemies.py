"""Enemies. Normal: viewBox 200x200, ground y=186, facing LEFT (toward the party).
Bosses MB01-03: 260x260 (ground 246). Demon king DK01: 300x300 (ground 286).
pose: idle | attack (通常攻撃) | big (大技) | guard (守り) | open (反撃の隙) | hit
"""
from common import P
from pen import part, face

INK = P['ink']


def _mk(fn, w, h):
    fn.W, fn.H = w, h
    return fn


def fk(pose):
    return {'idle': 'idle', 'attack': 'attack', 'big': 'big', 'guard': 'guard', 'open': 'open', 'hit': 'hit'}.get(pose, 'idle')


# ------------------------------------------------------------------ EN01 野ネズミ剣士
def en01(pose='idle'):
    def fn(pen, p=pose):
        W, arm, lean, crouch, ear, foot = -30, 0, 0, 1.0, 0, 0
        if p == 'attack':
            W, arm, lean = -78, -12, -7
        elif p == 'big':      # 剣先を後ろに隠す -> 踏み込み斬り
            W, arm, crouch, ear, foot = 150, 38, .9, 35, -10
        elif p == 'guard':
            W, arm, ear = -95, -55, 25
        elif p == 'open':     # 息をつく: 剣先を地面に
            W, arm, lean = -160, 14, 7
        rapier = (pen.path('M-2 -6V-64L0 -73L2 -64V-6Z', '#E8EEF2', 2) + pen.circle(0, -4, 7, P['gold'], 2)
                  + pen.rect(-2, -2, 4, 10, 2, P['leather'], 1.8))
        o = [part('tail', pen.line('M140 168C172 170 188 150 182 128C178 114 162 116 165 128', 4.5, '#C98B7A')),
             part('cape', pen.path('M104 112C124 116 142 134 148 168L112 172Z', '#C8473A')),
             part('foot-back', pen.ellipse(130, 182, 13, 6, '#C98B7A', 2.5)),
             part('body', pen.ellipse(112, 144, 30, 35, '#A99383') + pen.detail('<ellipse cx="100" cy="150" rx="15" ry="20" fill="#E6D8C8"/>')),
             part('foot-front', pen.ellipse(96, 182, 13, 6, '#C98B7A', 2.5), dx=foot),
             part('ear-back', pen.circle(112, 58, 19, '#A99383') + pen.detail('<circle cx="112" cy="58" r="11" fill="#E8A7A0"/>'), rot=ear, pivot=(108, 76)),
             part('head', pen.circle(90, 92, 30, '#A99383') + pen.ellipse(62, 102, 18, 13, '#BFAA9A') + pen.circle(45, 100, 5.5, '#E07A7A', 2)
                  + pen.line('M56 104L34 96M56 109L32 110', 1.6)
                  + pen.detail(face(pen, fk(p), [(72, 88), (90, 86)], 4.5, (62, 115, 9), sweat=(112, 70, 9), effort=(60, 70, 34)))),
             part('ear-front', pen.circle(76, 62, 18, '#A99383') + pen.detail('<circle cx="76" cy="62" r="10" fill="#E8A7A0"/>'), rot=ear, pivot=(84, 78)),
             part('arm-front', f'<g data-part="weapon" transform="translate(76 144) rotate({W})">{rapier}</g>'
                  + pen.ellipse(88, 136, 7, 14, '#A99383', 2.5, rot=50) + pen.circle(76, 144, 6, '#C98B7A', 2.5), rot=arm, pivot=(100, 128))]
        return part('EN01', ''.join(o), rot=lean, pivot=(112, 186), sy=crouch, sx=1.0)
    return _mk(fn, 200, 200)


# ------------------------------------------------------------------ EN02 鎧モグラ
def en02(pose='idle'):
    def fn(pen, p=pose):
        claw, rear, head_t, shell_s, shell_up = 0, 0, (0, 0, 0), 1.0, (0, 0, 0)
        if p == 'attack':
            claw = 60
        elif p == 'big':
            claw, rear, shell_s = 100, 12, 1.08
        elif p == 'guard':   # 鼻を土に埋め、背の鎧を丸める
            head_t, shell_s = (16, 22, -35), 1.14
        elif p == 'open':    # 鎧が開く
            shell_up = (-4, -16, 12)
        o = []
        o.append(part('foot-back', pen.ellipse(152, 180, 16, 8, '#E8A7A0', 2.5)))
        o.append(part('body', pen.ellipse(112, 142, 54, 40, '#7D6A63')))
        if p == 'open':
            o.append(part('belly', pen.ellipse(108, 150, 38, 24, '#E8A7A0', 2.5)))
        shell = (pen.path('M58 140C56 96 90 84 118 84C150 86 172 106 170 144C150 132 84 132 58 140Z', '#8F9CA6')
                 + pen.line('M74 112Q110 96 160 116', 2.2) + pen.line('M66 126Q112 110 166 130', 2.2) + pen.line('M92 92Q120 86 146 98', 2.2)
                 + pen.detail('<g fill="#2A1E16"><circle cx="96" cy="102" r="2"/><circle cx="128" cy="104" r="2"/><circle cx="112" cy="120" r="2"/><circle cx="146" cy="122" r="2"/></g>'))
        o.append(part('plates', shell, dx=shell_up[0], dy=shell_up[1], rot=shell_up[2], pivot=(112, 136), sx=shell_s))
        hx, hy, hr = head_t
        o.append(part('head', pen.ellipse(62, 148, 24, 20, '#7D6A63') + part('nose', pen.ellipse(36, 152, 12, 8, '#E59A9A', 2.5)
                      + pen.detail('<circle cx="30" cy="151" r="1.6" fill="#2A1E16"/><circle cx="36" cy="153" r="1.6" fill="#2A1E16"/>'))
                      + pen.detail(face(pen, fk(p), [(56, 142), (68, 140)], 3, (48, 160, 6), sweat=(82, 128, 8), effort=(50, 122, 30))),
                      dx=hx, dy=hy, rot=hr, pivot=(70, 150)))
        if p == 'guard':
            o.append(part('dirt', pen.path('M20 188C24 168 44 160 62 166C78 160 92 172 94 188Z', '#9C7A54') + pen.detail('<g fill="#6B4F35"><circle cx="40" cy="178" r="2.4"/><circle cx="62" cy="174" r="2"/><circle cx="80" cy="181" r="2.4"/></g>')))
        o.append(part('claw-front', pen.ellipse(54, 176, 16, 9, '#E8A7A0', 2.5)
                      + pen.path('M40 172L28 168L38 178ZM40 178L27 180L39 184Z', '#FFF6E6', 1.8), rot=claw, pivot=(72, 170)))
        return part('EN02', ''.join(o), rot=rear, pivot=(150, 186))
    return _mk(fn, 200, 200)


# ------------------------------------------------------------------ EN03 浅瀬ガニ
def en03(pose='idle'):
    def fn(pen, p=pose):
        cf = dict(dx=0, dy=0, rot=0, s=1.0)
        cb = dict(dx=0, dy=0, rot=0)
        eyes_dy, eye_rot, bubbles = 0, 0, False
        if p == 'attack':
            cf.update(dx=-10, dy=-4, rot=-15)
        elif p == 'big':      # 泡が片方のはさみに集まる
            cf.update(dx=8, dy=-38, rot=-18, s=1.25)
            cb.update(dy=8)
            bubbles = True
        elif p == 'guard':
            cf.update(dx=46, dy=-12, rot=20)
            cb.update(dx=-46, dy=-12, rot=-20)
            eyes_dy = 14
        elif p == 'open':     # 両ばさみが下がる
            cf.update(dy=34, rot=24)
            cb.update(dy=32, rot=-20)
            eye_rot = 14
        legs = ''.join(pen.line(d, 5, '#B85A45') for d in
                       ['M72 156L56 172L60 186', 'M84 162L76 178L82 188', 'M136 156L152 172L148 186', 'M124 162L132 178L126 188'])
        o = [part('legs', legs)]

        def claw(x, y, mirror=False):
            m = -1 if mirror else 1
            return (pen.line(f'M{x + m * 22} {y + 12}L{x + m * 6} {y + 4}', 6, '#B85A45')
                    + pen.ellipse(x, y, 22, 17, '#E07A5F', rot=-20 * m)
                    + pen.path(f'M{x - m * 16} {y - 8}Q{x - m * 34} {y - 16} {x - m * 30} {y - 30}Q{x - m * 18} {y - 22} {x - m * 6} {y - 14}Z', '#E07A5F', 2.5)
                    + pen.path(f'M{x - m * 18} {y + 4}Q{x - m * 36} {y + 4} {x - m * 34} {y - 8}Q{x - m * 22} {y - 4} {x - m * 8} {y - 2}Z', '#E8957E', 2.5))
        o.append(part('claw-back', claw(158, 118, True), dx=cb['dx'], dy=cb['dy'], rot=cb['rot'], pivot=(150, 124)))
        o.append(part('body', pen.ellipse(104, 142, 52, 30, '#E07A5F') + pen.detail('<path d="M70 150Q104 166 138 150" stroke="#B85A45" stroke-width="2" fill="none"/>')))
        eyes = (pen.line('M92 120L86 94', 4) + pen.line('M114 120L118 92', 4)
                + pen.circle(86, 92, 9, '#fff', 2.5) + pen.circle(118, 90, 9, '#fff', 2.5)
                + pen.detail(face(pen, fk(p), [(86, 93), (118, 91)], 3.4, (103, 136, 8), sweat=(136, 80, 8), effort=(102, 74, 30))))
        o.append(part('eyes', eyes, dy=eyes_dy, rot=eye_rot, pivot=(103, 122)))
        bub = ''
        if bubbles:
            bub = part('bubbles', ''.join(pen.circle(x, y, r, '#D7EEF3', 1.8) for x, y, r in
                                          [(18, 92, 6), (30, 80, 7.5), (44, 74, 5), (14, 70, 5), (26, 60, 4), (50, 90, 4), (8, 84, 3.5)]))
        o.append(part('claw-front', claw(48, 118) + bub, dx=cf['dx'], dy=cf['dy'], rot=cf['rot'], pivot=(56, 124), sx=cf['s']))
        return part('EN03', ''.join(o))
    return _mk(fn, 200, 200)


# ------------------------------------------------------------------ EN04 灯りコウモリ
def en04(pose='idle'):
    def fn(pen, p=pose):
        dy, rot, wf, wb, ring, cocoon = 0, 0, 0, 0, False, False
        if p == 'attack':
            dy, rot = 10, -15
        elif p == 'big':      # しっぽの光が細い輪を描く -> 急降下
            dy, wf, wb, ring = -26, 28, -28, True
        elif p == 'guard':
            cocoon = True
        elif p == 'open':     # 低く飛ぶ
            dy, wf, wb = 44, -26, 26
        o = []
        wing_b = pen.path('M118 90C140 60 170 50 192 56C186 66 188 74 194 82C182 80 174 86 172 96C162 90 152 94 148 104C138 98 128 100 118 104Z', '#8B76A3')
        wing_f = pen.path('M82 90C60 60 30 50 8 56C14 66 12 74 6 82C18 80 26 86 28 96C38 90 48 94 52 104C62 98 72 100 82 104Z', '#8B76A3')
        if not cocoon:
            o.append(part('wing-back', wing_b + pen.line('M148 70L150 100M170 64L160 96', 1.6), rot=wb, pivot=(118, 96)))
        o.append(part('tail', pen.line('M100 122C94 140 112 148 106 162', 3)
                      + part('tail-light', pen.detail('<circle cx="106" cy="168" r="12" fill="rgba(255,226,122,.45)"/>') + pen.circle(106, 168, 6.5, '#FFE27A', 2.2))
                      + (part('tail-ring', pen.circle(106, 168, 19, 'none', 3, '#C79A1A')) if ring else '')))
        o.append(part('body', pen.path('M82 82L76 54L94 72Z', '#6E5A86', 2.5) + pen.path('M118 82L124 54L106 72Z', '#6E5A86', 2.5)
                      + pen.circle(100, 98, 26, '#6E5A86') + pen.detail('<ellipse cx="100" cy="110" rx="14" ry="11" fill="#9C8BB5"/>')
                      + pen.detail('<path d="M94 113l3 6 3-6zM102 113l3 6 3-6z" fill="#fff" stroke="#2A1E16" stroke-width="1.2"/>')
                      + pen.detail(face(pen, fk(p), [(89, 94), (109, 94)], 4.3, None, sweat=(124, 74, 8), effort=(98, 64, 32)))))
        if cocoon:
            o.append(part('cocoon', pen.path('M64 88C64 60 136 60 136 88C140 118 124 140 100 140C76 140 60 118 64 88Z', '#8B76A3')
                          + pen.line('M84 70L80 132M100 66V138M116 70L120 132', 1.8)
                          + pen.path('M86 76L80 52L96 68ZM114 76L120 52L104 68Z', '#6E5A86', 2.5)
                          + pen.detail(face(pen, 'guard', [(90, 80), (110, 80)], 4))))
        else:
            o.append(part('wing-front', wing_f + pen.line('M52 70L50 100M30 64L40 96', 1.6), rot=wf, pivot=(82, 96)))
        return part('EN04', ''.join(o), dy=dy, rot=rot, pivot=(100, 100))
    return _mk(fn, 200, 200)


# ------------------------------------------------------------------ EN05 磁石ゴーレム
def en05(pose='idle'):
    def fn(pen, p=pose):
        af, ab, adj, s, dust, fall, head = 0, 0, 0, 1.0, False, False, 0
        if p == 'attack':
            af = 100
        elif p == 'big':      # 両腕に鉄粉が積もる
            af, ab, s, dust = 150, -150, 1.12, True
        elif p == 'guard':
            af, ab, adj = -60, 60, -16
        elif p == 'open':     # 鉄粉が落ちる
            af, ab, fall, head = -12, 12, True, 10
        o = [part('legs', pen.rect(76, 158, 24, 28, 6, '#7E7A75') + pen.rect(116, 158, 24, 28, 6, '#7E7A75'))]

        def arm(side):
            m = -1 if side == 'front' else 1
            px = 72 if side == 'front' else 144
            body = (pen.ellipse(px + m * 12, 128, 13, 25, '#7E7A75', rot=-15 * m)
                    + pen.circle(px + m * 18, 154, 17, '#8F8A84'))
            if dust:
                body += pen.path(f'M{px + m * 2} 116l{m * 8} -6 2 8 {m * 9} -4 -1 9 {m * 10} 1 -5 8 {m * 9} 6 -9 4 4 9 -10 -2 -2 9 -7 -7 -6 6 -4 -9 -6 -4z', '#4B4744', 2)
            return part(f'arm-{side}', body, rot=af if side == 'front' else ab, pivot=(px, 104), dy=adj, sx=s)
        o.append(arm('back'))
        o.append(part('body', pen.rect(68, 92, 80, 72, 14, '#8F8A84')
                      + part('dial', pen.rect(86, 110, 44, 32, 6, '#E2DACB', 2.2)
                             + pen.detail(''.join(f'<path d="M{90 + i * 6} 116v6" stroke="#2A1E16" stroke-width="1.6"/>' for i in range(7))
                                          + '<path d="M108 136L120 122" stroke="#C8473A" stroke-width="2.4" stroke-linecap="round"/>'))))
        o.append(part('head', pen.path('M84 54V30A24 24 0 0 1 132 30V54H118V30A10 10 0 0 0 98 30V54Z', '#C8473A')
                      + pen.rect(84, 46, 14, 10, 2, '#D6DDE2', 2) + pen.rect(118, 46, 14, 10, 2, '#D6DDE2', 2)
                      + pen.rect(80, 54, 56, 42, 12, '#8F8A84')
                      + pen.detail(face(pen, fk(p), [(96, 74), (116, 74)], 4.2, (106, 88, 9), sweat=(140, 54, 9), effort=(108, 22, 30))),
                      rot=head, pivot=(108, 96)))
        o.append(arm('front'))
        if fall:
            o.append(part('dust-fall', ''.join(pen.rect(x, y, 5, 5, 1, '#4B4744', 1.4) for x, y in
                                               [(40, 168), (52, 178), (34, 182), (160, 170), (172, 180), (150, 184)])))
        return part('EN05', ''.join(o))
    return _mk(fn, 200, 200)


# ------------------------------------------------------------------ EN06 霧ギツネ
def _fox_body(pen, dashed=False):
    return (pen.ellipse(108, 142, 36, 22, '#D9CFC4')
            + pen.path('M58 112L28 122L56 132Q74 140 88 128Q96 112 86 96L80 72L70 94Q62 100 58 112Z', '#D9CFC4'))


def en06(pose='idle'):
    def fn(pen, p=pose):
        o = []
        lean, tail_rot = 0, 0
        if p == 'big':        # 尻尾をほどくと左右に残像を散らす
            for dx in (-52, 52):
                o.append(part('afterimage', f'<g transform="translate({dx} -4)" opacity="0.55" stroke-dasharray="6 4">{_fox_body(pen)}</g>'))
            o.append(part('tail-wisps', pen.line('M134 140C160 120 150 96 176 80', 4, '#AFC3CF') + pen.line('M136 146C168 140 176 120 196 118', 4, '#AFC3CF')
                          + pen.line('M132 134C146 104 136 78 156 52', 4, '#AFC3CF')))
        elif p != 'guard':
            if p == 'open':
                tail_rot = 70
            o.append(part('tail', pen.path('M132 150C170 152 194 122 186 86C182 66 166 58 158 72C170 82 170 106 156 120C148 128 138 130 128 132Z', '#D9CFC4')
                          + pen.path('M168 64C176 58 186 66 186 80C178 74 172 72 166 72Z', '#FFFBF2', 2), rot=tail_rot, pivot=(132, 142)))
        if p == 'attack':
            lean = -9
        if p == 'guard':
            o.append(part('curl', pen.circle(110, 150, 36, '#D9CFC4')
                          + pen.path('M140 140C150 170 110 190 80 176C100 178 124 170 132 150Z', '#E9E1D3')
                          + pen.path('M84 126L74 100L94 116Z', '#D9CFC4', 2.5)
                          + pen.detail(face(pen, 'guard', [(96, 136), (110, 134)], 3.5))))
            return part('EN06', ''.join(o))
        o.append(part('legs', pen.rect(78, 150, 8, 34, 4, '#B9AFA4', 2.5) + pen.rect(126, 150, 8, 34, 4, '#B9AFA4', 2.5)
                      + pen.rect(92, 154, 8, 30, 4, '#CFC6BB', 2.5) + pen.rect(138, 152, 8, 32, 4, '#CFC6BB', 2.5)))
        o.append(part('body', _fox_body(pen) + pen.path('M70 96L84 74L86 96Z', '#AFC3CF', 2)
                      + pen.circle(30, 122, 4.5, INK, 0)
                      + pen.detail('<path d="M84 132Q96 150 82 158Q78 146 72 140Z" fill="#FFFBF2"/>')
                      + pen.detail(face(pen, fk(p), [(58, 110), (72, 106)], 3.6, (44, 128, 7), sweat=(92, 90, 8), effort=(62, 84, 30)))))
        return part('EN06', ''.join(o), rot=lean, pivot=(110, 186))
    return _mk(fn, 200, 200)


# ------------------------------------------------------------------ EN07 茨グモ
def en07(pose='idle'):
    def fn(pen, p=pose):
        lf_a, lf_b, body_dx, body_dy, legs_rot, thorns_s, thread, broken = 0, 0, 0, 0, 0, 1.0, False, False
        if p == 'attack':
            lf_a = 50
        elif p == 'big':      # 前脚を寄せて糸を張る
            lf_a, lf_b, body_dx, thread = 22, -26, 12, True
        elif p == 'guard':
            legs_rot, thorns_s = 1, 1.35
        elif p == 'open':     # 糸が切れた
            body_dy, broken = 12, True
        o = []
        if thread:
            o.append(part('thread', pen.line('M164 112L198 6', 2.2, '#5A5248') + pen.detail('<path d="M164 112L198 6" stroke="#FFFBF2" stroke-width="0.8"/>')))
        if broken:
            o.append(part('thread-broken', pen.line('M164 110C176 96 168 84 180 76', 2, '#5A5248') + pen.line('M196 10C186 20 194 30 184 38', 2, '#5A5248')))
        back = ''.join(pen.line(d, 5, '#3F4728') for d in ['M128 136L160 120L178 186', 'M134 140L172 140L192 184', 'M118 142L140 160L150 188'])
        if legs_rot:
            back = ''.join(pen.line(d, 5, '#3F4728') for d in ['M128 120L156 96L150 130', 'M134 126L170 118L166 150', 'M118 142L130 156L150 160'])
        o.append(part('legs-back', back))
        thorns = ''.join(pen.path(f'M{x - 5} {y + 3}L{x} {y - 9}L{x + 5} {y + 3}Z', '#A3B26A', 2) for x, y in
                         [(108, 90), (124, 82), (142, 82), (158, 90), (168, 104), (100, 104)])
        o.append(part('abdomen', pen.circle(132, 118, 36, '#5E6B3E') + part('thorns', thorns, sx=thorns_s, pivot=(132, 118))
                      + pen.detail('<path d="M112 120Q132 132 152 118M116 134Q132 142 148 132" stroke="#3F4728" stroke-width="2" fill="none"/>'),
                      dx=body_dx, dy=body_dy))
        o.append(part('head', pen.ellipse(82, 134, 26, 20, '#4F5A33')
                      + pen.detail('<circle cx="72" cy="120" r="2.6" fill="#2A1E16"/><circle cx="86" cy="118" r="2.6" fill="#2A1E16"/>')
                      + pen.detail(face(pen, fk(p), [(68, 130), (84, 128)], 4.4, (66, 146, 8), sweat=(98, 110, 8), effort=(70, 104, 30))),
                      dx=body_dx, dy=body_dy))
        fa = pen.line('M74 144L44 120L26 186', 5, '#3F4728')
        fb = pen.line('M86 148L62 132L52 188', 5, '#3F4728')
        if legs_rot:
            fa = pen.line('M74 144L58 112L84 104', 5, '#3F4728')
            fb = pen.line('M86 148L70 120L96 112', 5, '#3F4728')
        o.append(part('leg-front-b', fb, rot=lf_b, pivot=(86, 148), dx=body_dx, dy=body_dy))
        o.append(part('leg-front-a', fa, rot=lf_a, pivot=(74, 144), dx=body_dx, dy=body_dy))
        return part('EN07', ''.join(o))
    return _mk(fn, 200, 200)


# ------------------------------------------------------------------ EN08 城壁ガーゴイル
def en08(pose='idle'):
    def fn(pen, p=pose):
        o = []
        dy, rot, wf, wb, ws, slabs, arm = 0, 0, 0, 0, 1.0, False, 0
        if p == 'attack':
            arm, wf, wb = 40, -12, 12
        elif p == 'big':      # 翼が石の板のように閉じ、高台から飛び込む
            dy, slabs = -40, True
        elif p == 'guard':
            wf, wb = -60, 40
        elif p == 'open':     # 翼を広げ直す隙
            rot, ws, wf, wb = 8, 1.2, 18, -18
        if p == 'big':
            o.append(part('perch', pen.path('M50 190V156H64V146H82V156H104V146H122V156H144V146H162V156H176V190Z', '#B5AFA6')
                          + pen.line('M50 170H176M90 156V170M132 170V190', 1.6), dy=36))
        if not slabs:
            o.append(part('wing-back', pen.path('M120 96L186 50L192 96L172 122Z', '#8E8A84') + pen.line('M140 86L182 62M150 100L188 84', 1.6),
                          rot=wb, pivot=(120, 100), sx=ws))
        o.append(part('legs', pen.ellipse(132, 156, 22, 18, '#A29D95') + pen.path('M104 176L96 186H116L114 176ZM142 176L138 186H158L154 174Z', '#8E8A84', 2.5)))
        o.append(part('body', pen.path('M82 98Q112 86 134 104L142 152Q110 168 78 152Z', '#A29D95')
                      + pen.detail('<path d="M100 112l6 10-4 8M120 126l-6 8" stroke="#6E6A64" stroke-width="1.8" fill="none"/>')
                      + (pen.detail('<ellipse cx="108" cy="134" rx="16" ry="12" fill="#C9C3BA"/>') if p == 'open' else '')))
        if slabs:
            o.append(part('slab-back', pen.rect(130, 74, 30, 92, 4, '#8E8A84', rot=(6, 145, 120))))
        o.append(part('head', pen.path('M58 84Q60 62 82 60Q100 62 102 82L96 100Q76 108 60 100Z', '#A29D95')
                      + pen.path('M66 66C58 50 60 38 70 30C70 44 76 54 80 62Z', '#8E8A84', 2.5) + pen.path('M90 62C94 48 104 40 116 38C110 48 104 56 100 68Z', '#8E8A84', 2.5)
                      + pen.path('M58 90L42 96L58 100Z', '#8E8A84', 2.5)
                      + pen.detail(face(pen, fk(p), [(70, 82), (86, 80)], 3.9, (72, 98, 8), sweat=(104, 60, 8), effort=(76, 40, 30)))))
        o.append(part('arm-front', pen.line('M90 120L64 140', 9, '#8E8A84') + pen.path('M64 132L48 136L52 144L48 152L64 148Z', '#A29D95', 2.5),
                      rot=arm, pivot=(90, 120)))
        if slabs:
            o.append(part('slab-front', pen.rect(52, 70, 32, 96, 4, '#9A958E', rot=(-6, 68, 118)) + pen.line('M56 100H82M56 130H82', 1.6)))
        else:
            o.append(part('wing-front', pen.path('M96 98L40 44L30 90L54 110Z', '#8E8A84') + pen.line('M74 82L42 56M64 98L34 80', 1.6),
                          rot=wf, pivot=(96, 100), sx=ws))
        return part('EN08', ''.join(o), dy=dy, rot=rot, pivot=(112, 186))
    return _mk(fn, 200, 200)


# ------------------------------------------------------------------ EN09 草盾タヌキ
def en09(pose='idle'):
    def fn(pen, p=pose):
        o = []
        bundle_t, lean, bs = (0, 0, 0), 0, 1.0
        if p == 'attack':     # 足元の草束を持ち上げる
            bundle_t, lean = (6, -78, -16), 6
        elif p == 'big':
            bundle_t, lean, bs = (6, -82, -16), 8, 1.45
        o.append(part('tail', pen.ellipse(152, 150, 18, 28, '#9C7A54', rot=35)
                      + pen.line('M140 136L158 146M134 150L152 162', 4, '#5B4636')))
        o.append(pen.ellipse(92, 182, 13, 6, '#5B4636', 2.5) + pen.ellipse(124, 182, 13, 6, '#5B4636', 2.5))
        o.append(part('body', pen.ellipse(108, 142, 38, 40, '#9C7A54')
                      + part('belly', pen.ellipse(100, 150, 22, 26, '#F0DDBE', 2))))
        o.append(part('head', pen.circle(68, 66, 9, '#5B4636', 2.5) + pen.circle(110, 64, 9, '#5B4636', 2.5)
                      + pen.circle(90, 92, 30, '#9C7A54')
                      + pen.path('M62 84Q76 74 90 84Q104 74 116 84Q112 100 90 98Q66 100 62 84Z', '#5B4636', 2)
                      + pen.detail('<ellipse cx="76" cy="88" rx="8" ry="7" fill="#F0DDBE"/><ellipse cx="102" cy="87" rx="8" ry="7" fill="#F0DDBE"/>')
                      + pen.ellipse(76, 106, 14, 9, '#F0DDBE', 2) + pen.circle(64, 103, 4.5, INK, 0)
                      + pen.detail(face(pen, fk(p), [(76, 88), (102, 87)], 3.6, (78, 113, 7), sweat=(122, 70, 8), effort=(80, 54, 30)))))
        grass = (pen.path('M-10 0L-16 -34M-5 0L-6 -40M0 0L4 -42M5 0L12 -36M10 0L20 -28', 'none', 4, '#5E8C34')
                 + pen.line('M-10 0L-16 -34M-5 0L-6 -40M0 0L4 -42M5 0L12 -36M10 0L20 -28', 2.2, '#9DCB6A')
                 + pen.rect(-12, -6, 24, 9, 3, '#C9A36B', 2))
        if p in ('idle', 'attack', 'big'):
            bx, by, br = bundle_t
            o.append(part('grass', f'<g transform="translate({80 + bx} {138 + by}) rotate({br}) scale({bs})">{grass}</g>'
                          + pen.circle(72, 136 + by * .9, 6.5, '#9C7A54', 2.5) + pen.circle(90, 138 + by * .9, 6.5, '#9C7A54', 2.5)))
        if p == 'guard':      # 編んだ草を盾にする
            o.append(part('shield', pen.ellipse(78, 150, 42, 52, '#A9C46A')
                          + pen.detail('<g stroke="#6E8C3A" stroke-width="2.2" fill="none"><path d="M44 130Q78 140 112 130M40 150Q78 160 116 150M44 170Q78 180 112 170"/><path d="M62 102Q56 150 64 198M78 98V202M94 102Q100 150 92 198"/></g>')))
        if p == 'open':       # 草盾がほどける
            o.append(part('shield-loose', ''.join(pen.line(d, 3.2, '#7FA84A') for d in
                                                  ['M30 120C40 140 30 160 44 180', 'M52 110C46 140 60 160 50 186', 'M124 120C136 140 128 160 140 178', 'M40 96C30 110 34 124 24 132'])))
            o.append(pen.circle(64, 116, 6.5, '#9C7A54', 2.5) + pen.circle(132, 112, 6.5, '#9C7A54', 2.5))
        return part('EN09', ''.join(o), rot=lean, pivot=(108, 186))
    return _mk(fn, 200, 200)


# ------------------------------------------------------------------ EN10 水車カワウソ
def en10(pose='idle'):
    def fn(pen, p=pose):
        o = []
        ot = dict(dx=0, dy=0, rot=0, s=1.0)
        if p == 'big':        # 車輪の一番上で背を丸める
            ot.update(dx=58, dy=-92, rot=-24, s=.9)
        elif p == 'guard':
            ot.update(dx=44)
        elif p == 'open':     # 石段で息をつく
            ot.update(dx=-8, dy=-18)
        if p == 'open':
            o.append(part('steps', pen.rect(30, 158, 96, 30, 4, '#B5AFA6') + pen.rect(56, 136, 70, 24, 4, '#C9C3BA') + pen.line('M30 172H126', 1.6)))
        o.append(part('water', pen.detail('<path d="M96 178Q148 170 200 178V190H96Z" fill="#9FD3F0" stroke="#2A1E16" stroke-width="2"/>')))
        wheel = (pen.circle(150, 120, 42, 'none', 7, '#8B6A47') + pen.circle(150, 120, 8, '#8B6A47', 2.5)
                 + ''.join(pen.line(f'M150 120L{150 + 42 * c:.1f} {120 + 42 * s:.1f}', 3.5, '#8B6A47') for c, s in
                           [(1, 0), (.5, .866), (-.5, .866), (-1, 0), (-.5, -.866), (.5, -.866)])
                 + ''.join(pen.rect(150 + 42 * c - 6, 120 + 42 * s - 6, 12, 12, 2, '#B98B5A', 2) for c, s in
                           [(1, 0), (.5, .866), (-.5, .866), (-1, 0), (-.5, -.866), (.5, -.866)]))
        otter = (pen.path('M112 168C132 174 150 182 166 186L118 184Z', '#6B4F38', 2.5)
                 + pen.path('M70 104C62 130 70 170 96 178C116 182 124 160 118 130C114 110 96 96 82 98Z', '#7A5A40')
                 + pen.detail('<path d="M78 118C74 138 80 160 94 166C104 160 106 140 100 124Z" fill="#C8A47E"/>')
                 + pen.circle(70, 70, 6, '#7A5A40', 2.5) + pen.circle(92, 70, 6, '#7A5A40', 2.5)
                 + pen.circle(80, 88, 22, '#7A5A40') + pen.ellipse(62, 96, 13, 9, '#C8A47E', 2.2) + pen.circle(52, 93, 4.2, INK, 0)
                 + pen.line('M58 100L40 98M58 104L40 108', 1.4)
                 + pen.detail(face(pen, fk(p), [(68, 84), (84, 82)], 3.6, (60, 106, 6), sweat=(100, 66, 8), effort=(76, 60, 28)))
                 + part('arm-front', pen.ellipse(66, 130, 6, 11, '#7A5A40', 2.5, rot=(40 if p == 'attack' else 10))))
        if p == 'guard':
            o.append(part('otter', otter, dx=ot['dx']))
            o.append(part('wheel', wheel))
        else:
            o.append(part('wheel', wheel))
            o.append(part('otter', otter, dx=ot['dx'], dy=ot['dy'], rot=ot['rot'], pivot=(92, 140), sx=ot['s']))
        if p == 'attack':
            o.append(part('splash', pen.path('M8 176Q20 150 34 166Q40 146 52 162Q58 150 64 168Z', '#9FD3F0', 2.2)
                          + pen.ellipse(16, 150, 4, 6, '#9FD3F0', 1.8) + pen.ellipse(38, 140, 4, 6, '#9FD3F0', 1.8)))
        return part('EN10', ''.join(o))
    return _mk(fn, 200, 200)


# ------------------------------------------------------------------ EN11 鉱灯ヤドカリ
def en11(pose='idle'):
    def fn(pen, p=pose):
        o = []
        shell_rot, legs_sx, claw_t, lid, lid_open, hide = 0, 1.0, (0, 0, 0), False, False, False
        if p == 'attack':
            claw_t = (-16, 2, -20)
        elif p == 'guard':    # 殻の蓋を閉じる
            lid, hide = True, True
        elif p == 'big':      # 殻の下で脚を踏ん張り、前に突き出す
            shell_rot, legs_sx = -16, 1.18
        elif p == 'open':     # 殻が引っかかり、灯がのぞく
            shell_rot, lid_open = -10, True
        if not hide:
            o.append(part('legs', ''.join(pen.line(d, 6, '#D9663F') for d in
                                          ['M84 150L66 168L60 188', 'M100 158L92 176L96 190', 'M120 164L124 180L132 190']), sx=legs_sx, pivot=(100, 190)))
        shell = (pen.path('M64 150L60 104L84 70L130 52L172 72L188 120L176 164L120 178Z', '#8C7F72')
                 + pen.line('M84 70L104 110L130 52M104 110L172 72M104 110L120 178M104 110L188 120', 1.6)
                 + pen.path('M140 80l10-6 6 10-10 6z', '#E6C15A', 1.8) + pen.path('M156 132l8-8 8 8-8 8z', '#6FB7C9', 1.8)
                 + pen.path('M118 140l7-5 5 7-7 5z', '#E6C15A', 1.8)
                 + pen.ellipse(78, 126, 16, 26, '#3B2F2A', 2.5))
        lamp = part('lamp', pen.line('M136 56V40', 2.5) + pen.path('M126 40h20l-3-6h-14z', '#5E6A74', 2)
                    + pen.rect(127, 40, 18, 20, 4, '#FBE7A6', 2.2)
                    + pen.detail('<path d="M136 57c-3 0-4-2-4-4 0-3 4-5 4-8 1 3 4 5 4 8 0 2-1 4-4 4z" fill="#F29A3A"/>')
                    + (pen.detail('<circle cx="136" cy="50" r="18" fill="rgba(255,226,122,.35)"/>') if p == 'open' else ''))
        inner = ''
        if not hide:
            inner = (pen.line('M74 112L62 90', 3.5) + pen.line('M84 110L82 86', 3.5)
                     + pen.circle(62, 88, 7.5, '#fff', 2.2) + pen.circle(82, 84, 7.5, '#fff', 2.2)
                     + pen.detail(face(pen, fk(p), [(62, 89), (82, 85)], 3, (76, 132, 6), sweat=(100, 72, 8), effort=(70, 62, 28))))
        lidg = ''
        if lid:
            lidg = part('lid', pen.ellipse(78, 126, 21, 30, '#A3968A') + pen.detail('<g fill="#6E6258"><circle cx="72" cy="114" r="2.4"/><circle cx="84" cy="128" r="2.4"/><circle cx="74" cy="140" r="2.4"/></g>'))
        if lid_open:
            lidg = part('lid', pen.ellipse(78, 126, 21, 30, '#A3968A'), rot=-70, pivot=(66, 100))
        o.append(part('shell', shell + lamp + inner + lidg, rot=shell_rot, pivot=(120, 178)))
        if not hide:
            cx, cy, cr = claw_t
            o.append(part('claw', pen.line('M70 146L50 150', 7, '#D9663F') + pen.ellipse(40, 150, 16, 11, '#E07A5F')
                          + pen.path('M28 144Q16 136 22 128Q30 136 38 142Z', '#E07A5F', 2.2), dx=cx, dy=cy, rot=cr, pivot=(70, 146)))
        return part('EN11', ''.join(o))
    return _mk(fn, 200, 200)


# ------------------------------------------------------------------ EN12 霧鈴フクロウ
def en12(pose='idle'):
    def fn(pen, p=pose):
        o = []
        dy, rot, spread, branch = 0, 0, False, True
        if p == 'attack':     # 低い枝の下を横切って翼で打つ
            rot, branch = -22, False
        elif p == 'big':      # 両翼が大きく開く
            dy, spread, branch = -18, True, False
        elif p == 'open':     # 低い枝に止まって翼をたたむ
            dy = 26
        if branch:
            o.append(part('branch', pen.path('M30 172Q110 162 196 176L196 184Q110 172 30 182Z', '#7A5A3C')
                          + pen.ellipse(54, 166, 10, 5, '#7FA35A', 2, rot=-20) + pen.ellipse(176, 168, 10, 5, '#7FA35A', 2, rot=20), dy=0))
        if spread:
            o.append(part('wing-back', pen.path('M128 104C160 80 188 70 198 74C194 92 186 112 170 126C160 122 150 126 140 134Z', '#7A7064')
                          + pen.line('M150 104L186 84M154 116L190 100', 1.6)))
            o.append(part('wing-front', pen.path('M76 104C44 80 16 70 4 74C8 92 16 112 32 126C42 122 52 126 62 134Z', '#7A7064')
                          + pen.line('M52 104L16 84M48 116L12 100', 1.6)))
        o.append(part('body', pen.ellipse(102, 124, 38, 46, '#8E8478')
                      + pen.detail('<ellipse cx="102" cy="138" rx="22" ry="26" fill="#CFC4B4"/><path d="M92 132l4 4 4-4M104 132l4 4 4-4M96 146l4 4 4-4M108 146l4 4 4-4" stroke="#8E8478" stroke-width="1.6" fill="none"/>')
                      + pen.path('M72 84L66 62L84 76Z', '#8E8478', 2.5) + pen.path('M132 84L138 62L120 76Z', '#8E8478', 2.5)
                      + pen.circle(88, 100, 17, '#E9E1D3', 2) + pen.circle(116, 100, 17, '#E9E1D3', 2)
                      + pen.path('M97 108L102 122L107 108Z', '#E3A41C', 2)
                      + part('bell', pen.line('M90 150Q102 158 114 150', 2.5, '#C8473A') + pen.path('M96 158Q96 150 102 150Q108 150 108 158L110 162H94Z', '#E3A41C', 2))
                      + pen.detail(face(pen, fk(p), [(88, 100), (116, 100)], 6, None, sweat=(136, 76, 9), effort=(102, 60, 34)))
                      + pen.ellipse(90, 170, 6, 4, '#E3A41C', 2) + pen.ellipse(114, 170, 6, 4, '#E3A41C', 2)))
        if not spread:
            o.append(part('wing-front', pen.ellipse(70, 128, 15, 34, '#7A7064', rot=12, )
                          , rot=(-60 if p == 'attack' else 0), pivot=(74, 100)))
            o.append(part('wing-back', pen.ellipse(134, 128, 15, 34, '#7A7064', rot=-12)))
        return part('EN12', ''.join(o), dy=dy, rot=rot, pivot=(102, 124))
    return _mk(fn, 200, 200)


# ------------------------------------------------------------------ EN13 城壁槍コボルト
def en13(pose='idle'):
    def fn(pen, p=pose):
        o = []
        sp_rot, hand, lean = 0, (64, 118), 0
        if p == 'attack':     # 槍を反して柄の端を横に振る
            sp_rot = 110
        elif p == 'big':      # 石畳の線に槍先を合わせる
            sp_rot, hand, lean = -90, (82, 160), -12
        elif p == 'open':     # 槍先が石の隙間に引っかかる
            sp_rot, hand, lean = -150, (74, 132), 12
        if p == 'big':
            o.append(part('pave-line', pen.detail(f'<path d="M-40 186H90" stroke="{P["tell-big"]}" stroke-width="3" stroke-dasharray="10 6"/>')
                          + pen.line('M20 192V180M60 192V180', 1.4)))
        if p == 'open':
            o.append(part('gap', pen.line('M0 190L12 180L24 190', 2)))
        spear = (pen.line('M0 -96V66', 5, INK) + pen.line('M0 -96V66', 2.5, '#B07A44')
                 + pen.path('M0 -124Q9 -108 0 -92Q-9 -108 0 -124Z', '#D6DDE2', 2.2)
                 + pen.rect(-4, 62, 8, 10, 2, '#8D9AA5', 2))
        o.append(pen.rect(88, 148, 11, 36, 5, '#4F4A52', 2.5) + pen.rect(104, 148, 11, 36, 5, '#4F4A52', 2.5)
                 + pen.ellipse(92, 184, 10, 5, '#5B4636', 2.2) + pen.ellipse(110, 184, 10, 5, '#5B4636', 2.2))
        o.append(part('body', pen.path('M84 104Q102 96 120 104L124 152Q102 160 80 152Z', '#3E4F8A')
                      + pen.path('M96 104H108V156H96Z', '#F3E3C3', 2)))
        o.append(part('head', pen.path('M86 66L80 30L100 60Z', '#C9A36B', 2.5) + pen.path('M108 62L118 26L120 66Z', '#C9A36B', 2.5)
                      + pen.circle(100, 80, 21, '#C9A36B') + pen.ellipse(80, 90, 13, 9, '#E3C99A', 2.2) + pen.circle(68, 88, 3.6, INK, 0)
                      + pen.path('M84 64Q102 56 118 66', 'none', 4, '#C8473A')
                      + pen.detail(face(pen, fk(p), [(88, 78), (102, 76)], 3.3, (78, 99, 6), sweat=(122, 60, 8), effort=(92, 40, 30)))))
        hx, hy = hand
        o.append(part('spear', f'<g transform="translate({hx} {hy}) rotate({sp_rot})">{spear}</g>'))
        o.append(part('arm-front', pen.line(f'M90 112L{hx} {hy}', 7, '#3E4F8A') + pen.circle(hx, hy, 6, '#C9A36B', 2.5)))
        return part('EN13', ''.join(o), rot=lean, pivot=(100, 186))
    return _mk(fn, 200, 200)


# ================================================================== bosses (260x260, ground 246)
def mb01(pose='idle'):
    """石門番: 門の形の体と石の腕。大技 = 石の腕を頭上で止める。"""
    def fn(pen, p=pose):
        o = []
        af, ab, dyb, headr = 0, 0, 0, 0
        if p == 'attack':
            af = 100
        elif p == 'big':
            af, ab = 170, -170
        elif p == 'open':
            af, ab, dyb, headr = -10, 10, 8, 8

        def arm(side):
            m = 1 if side == 'front' else -1
            px = 72 if side == 'front' else 188
            body = (pen.rect(px - m * 22 - (0 if m == 1 else 34), 104, 34, 50, 8, '#9A9488')
                    + pen.rect(px - m * 30 - (0 if m == 1 else 38), 146, 38, 44, 8, '#A7A196')
                    + pen.rect(px - m * 44 - (0 if m == 1 else 52), 184, 52, 46, 12, '#B5AFA6')
                    + pen.line(f'M{px - m * 44 - (0 if m == 1 else 52) + 12} 198h{28}M{px - m * 44 - (0 if m == 1 else 52) + 12} 212h{28}', 1.6))
            return part(f'arm-{side}', body, rot=af if side == 'front' else ab, pivot=(px, 112))
        o.append(arm('back'))
        o.append(part('legs', pen.rect(92, 210, 32, 36, 6, '#8F887C') + pen.rect(136, 210, 32, 36, 6, '#8F887C')))
        o.append(part('body', pen.path('M64 222V112Q64 62 130 62Q196 62 196 112V222Z', '#A7A196')
                      + pen.line('M64 140H196M64 180H196M100 62V100M160 62V100M84 140V180M176 140V180', 1.6)
                      + part('door', pen.path('M106 222V172Q106 150 130 150Q154 150 154 172V222Z', '#3B332C', 2.5))
                      + pen.path('M70 96Q76 80 92 82Q86 90 84 98Z', '#7FA35A', 2), dy=dyb))
        o.append(part('head', pen.rect(102, 22, 56, 50, 12, '#B5AFA6') + pen.path('M112 24Q120 10 134 16Q146 8 150 24Z', '#7FA35A', 2.2)
                      + pen.detail(face(pen, fk(p), [(119, 46), (141, 46)], 5, (130, 62, 10), sweat=(166, 30, 10), effort=(130, 0, 36))),
                      rot=headr, pivot=(130, 72), dy=dyb))
        o.append(arm('front'))
        if p == 'big':
            o.append(part('dust', ''.join(pen.circle(x, y, r, '#B5AFA6', 1.8) for x, y, r in
                                          [(96, 40, 4), (108, 64, 3), (160, 52, 3.5), (172, 70, 3), (120, 84, 2.6)])))
        if p == 'open':
            o.append(part('steam', pen.detail('<g fill="#fff" stroke="#2A1E16" stroke-width="1.6"><circle cx="176" cy="14" r="8"/><circle cx="188" cy="6" r="6"/><circle cx="196" cy="16" r="5"/></g>')))
        return part('MB01', ''.join(o))
    return _mk(fn, 260, 260)


def mb02(pose='guard'):
    """鉄甲虫: まるい鉄の殻と一本角。殻の継ぎ目が開く手と閉じる手を予告。"""
    def fn(pen, p=pose):
        o = []
        shell_open, head_rot, dx, legs_s = 0, 0, 0, 1.0
        if p == 'attack':
            shell_open, head_rot = -12, 10
        elif p == 'big':      # 閉殻の突進
            head_rot, dx = -22, -12
        elif p == 'guard':
            legs_s = .75
        elif p == 'open':     # 殻が開く
            shell_open = -48
        o.append(part('legs', ''.join(pen.line(d, 6, '#3E444A') for d in
                                      ['M90 200L76 226L60 246', 'M140 210L136 232L146 246', 'M196 204L212 226L226 246']),
                      sy=legs_s, pivot=(140, 200)))
        o.append(part('body', pen.ellipse(146, 196, 84, 30, '#4E565E')))
        if shell_open:
            o.append(part('inner', pen.ellipse(152, 160, 70, 40, '#E6B45A')
                          + pen.detail('<path d="M100 150Q152 140 204 156M100 168Q152 160 206 172" stroke="#B5822E" stroke-width="2.4" fill="none"/>')
                          + (pen.detail('<g stroke="#F7D046" stroke-width="3" stroke-linecap="round"><path d="M150 100V80M184 106l12-14M120 104l-10-14"/></g>') if p == 'open' else '')))
        o.append(part('shell-back', pen.path('M62 200C60 128 116 92 184 98C226 104 246 144 238 200Z', '#5F6A74')))
        o.append(part('shell-front', pen.path('M62 200C66 136 120 100 186 106C226 112 244 150 238 200C200 186 116 184 62 200Z', '#7F8A94')
                      + pen.line('M80 160Q160 130 232 168', 2, '#4E565E')
                      + pen.detail('<g fill="#2A1E16"><circle cx="112" cy="140" r="2.6"/><circle cx="150" cy="128" r="2.6"/><circle cx="190" cy="132" r="2.6"/><circle cx="216" cy="150" r="2.6"/></g>'),
                      rot=shell_open, pivot=(80, 196)))
        if p == 'open':
            o.append(part('wings', pen.detail('<path d="M120 120C150 60 220 50 250 80C220 90 180 110 150 140Z" fill="rgba(223,236,240,.65)" stroke="#2A1E16" stroke-width="2"/>')))
        o.append(part('head', pen.ellipse(54, 196, 30, 24, '#3E444A')
                      + part('horn', pen.path('M40 182C20 160 18 126 34 104C38 128 50 150 66 176Z', '#5A626A'))
                      + pen.circle(44, 190, 8, '#E6E8EA', 2) + pen.circle(62, 186, 8, '#E6E8EA', 2)
                      + pen.detail(face(pen, fk(p), [(44, 191), (62, 187)], 3.6, None, sweat=(82, 168, 9), effort=(54, 150, 30))),
                      rot=head_rot, pivot=(70, 200)))
        if p == 'big':
            o.append(part('dust', pen.detail('<g fill="#D9CFC4" stroke="#2A1E16" stroke-width="1.6"><circle cx="236" cy="236" r="9"/><circle cx="252" cy="226" r="7"/><circle cx="222" cy="244" r="6"/></g>')))
        return part('MB02', ''.join(o), dx=dx)
    return _mk(fn, 260, 260)


def mb03(pose='idle', real=True):
    """霧狼: たてがみの大狼。本体の足元だけに新しい足跡。"""
    def fn(pen, p=pose):
        o = []
        dy, sy, head_rot, leg = 0, 1.0, 0, 0
        if p == 'attack':
            leg = 40
        elif p == 'big':      # 影走りの飛びかかり
            dy, sy, head_rot = 14, .86, 8
        elif p == 'open':     # 足を止める
            head_rot = -14
        if p == 'big':
            o.append(part('shadow-run', pen.detail('<ellipse cx="60" cy="244" rx="96" ry="10" fill="rgba(42,30,22,.35)"/>')))
        if real:
            o.append(part('footprints', ''.join(f'<use href="#i-foot" x="{x}" y="{y}" width="20" height="20" transform="rotate(-90 {x + 10} {y + 10})"/>'
                                                 for x, y in [(14, 232), (40, 238), (66, 230)]) if not pen.cut else ''))
        o.append(part('tail', pen.path('M196 156C228 150 250 120 246 90C236 104 222 112 206 130Z', '#7F8C9A')))
        o.append(part('legs-back', pen.rect(176, 180, 18, 66, 8, '#6F7C8A') + pen.rect(198, 176, 18, 70, 8, '#6F7C8A'), sy=sy, pivot=(190, 246)))
        o.append(part('body', pen.ellipse(150, 160, 72, 40, '#7F8C9A')
                      + pen.line('M120 140q20 -8 40 0M140 176q24 -6 48 2', 2, '#A7B2BD'), dy=dy))
        o.append(part('leg-back-front', pen.rect(92, 176, 18, 70, 8, '#6F7C8A'), sy=sy, pivot=(100, 246)))
        o.append(part('mane', pen.path('M70 108L84 92L92 108L106 96L110 114L126 110L118 128L132 136L114 144L118 160L100 152L92 168L84 150L68 156L74 138L58 132L74 122Z', '#A7B2BD'), dy=dy))
        o.append(part('head', pen.path('M36 124L68 98L74 70L88 92L102 86L110 106Q116 132 94 148L62 152L30 140Z', '#7F8C9A')
                      + pen.path('M74 74L84 90L90 88Z', '#A7B2BD', 2) + pen.circle(32, 132, 5, INK, 0)
                      + pen.path('M44 142l4 8 4-7zM56 144l4 8 4-7z', '#fff', 1.6)
                      + pen.detail(face(pen, fk(p), [(66, 114), (84, 110)], 4.4, (52, 136, 9), sweat=(102, 84, 10), effort=(70, 74, 34))),
                      rot=head_rot, pivot=(96, 140), dy=dy))
        o.append(part('leg-front', pen.rect(66, 172, 18, 74, 8, '#6F7C8A')
                      + (pen.path('M62 246l-6 -8M72 246l-2 -9M82 246l4 -8', 'none', 2.2) if p == 'attack' else ''),
                      rot=leg, pivot=(76, 176), sy=sy))
        return part('MB03', ''.join(o))
    return _mk(fn, 260, 260)


# ================================================================== demon king (300x300, ground 286)
def dk01(pose='p1-idle'):
    """魔王: 大きな王冠とマント。前半=剣、体力半分で王冠が割れる、後半=大技の直後に反撃の隙。"""
    def fn(pen, p=pose):
        o = []
        phase2 = p.startswith('p2') or p == 'crack'
        cracked = phase2
        sw_rot, sw_dx, sw_dy = 0, 0, 0
        hands_dy = 0
        crown_t = (0, 0, 0)
        kind = 'idle'
        cape_sx = 1.0
        if p in ('p1-attack', 'p2-attack'):
            sw_rot, kind = 140, 'attack'
        elif p in ('p1-big', 'p2-big'):
            sw_rot, sw_dy, hands_dy, kind, cape_sx = 180, -84, -84, 'big', 1.08
        elif p in ('p1-open',):
            sw_rot, kind = -22, 'open'
        elif p == 'p2-open':      # 王冠の隙
            sw_rot, kind, crown_t = -24, 'open', (14, 4, 18)
        elif p == 'crack':
            kind = 'open'
        if p == 'p2-attack':
            sw_rot = 90
        if p == 'p2-big':
            o.append(part('throne-aura', pen.detail('<path d="M60 286V60Q60 20 100 30L110 64Q150 20 190 64L200 30Q240 20 240 60V286Z" fill="rgba(90,63,120,.55)" stroke="#2A1E16" stroke-width="2" stroke-dasharray="8 6"/>')))
        cape = 'M108 96C66 146 40 222 28 286H272C260 222 234 146 192 96Z'
        if phase2:
            cape = 'M108 96C66 146 40 222 28 274L44 286L60 270L78 286L96 272L116 286L134 270L150 286L168 270L186 286L204 272L222 286L240 270L256 286L272 274C260 222 234 146 192 96Z'
        o.append(part('cape', pen.path(cape, '#4B2F5E') + pen.path('M116 104C88 150 70 220 62 280H84C92 220 108 150 132 108Z', '#A3283A', 2.2),
                      sx=cape_sx, pivot=(150, 286)))
        o.append(part('body', pen.path('M112 96Q150 84 188 96L196 196Q150 210 104 196Z', '#3A2E44')
                      + pen.line('M150 92V200M118 120Q150 132 182 120', 2.2, '#E3A41C')
                      + pen.rect(106, 184, 88, 14, 5, '#E3A41C', 2.2)))
        if p == 'p2-attack':
            o.append(part('wave', ''.join(pen.path(f'M{x} 150Q{x - 30} 180 {x} 214Q{x - 16} 180 {x} 150Z', '#8E6CB0', 2.2) for x in (40, 70, 100))))
        # head
        crack = ''
        if cracked:
            crack = part('crown-crack', pen.line('M146 16L154 30L144 40L156 52L148 66', 3, INK)
                         + pen.line('M154 30L166 34M144 40L134 44', 2, INK))
        crown = part('crown', pen.path('M110 66L102 18L126 42L140 10L150 36L160 10L174 42L198 18L190 66Z', '#E3A41C')
                     + pen.rect(108, 58, 84, 12, 3, '#C98A10', 2.2)
                     + pen.circle(150, 50, 6, '#C8473A', 2) + pen.circle(126, 54, 4.5, '#3F78C4', 2) + pen.circle(174, 54, 4.5, '#3F78C4', 2)
                     + crack, dx=crown_t[0], dy=crown_t[1], rot=crown_t[2], pivot=(150, 66))
        head = (pen.path('M112 70Q104 52 118 48Q114 62 124 70Z', '#2A1E16', 2) + pen.path('M188 70Q196 52 182 48Q186 62 176 70Z', '#2A1E16', 2)
                + pen.circle(150, 92, 34, '#8C7BA0')
                + pen.detail('<ellipse cx="136" cy="88" rx="9" ry="7" fill="#FFF4D6"/><ellipse cx="164" cy="88" rx="9" ry="7" fill="#FFF4D6"/>')
                + pen.detail(face(pen, kind, [(136, 88), (164, 88)], 4.4, None, look=-1, sweat=(190, 66, 10), effort=(150, 36, 46)))
                + pen.path('M150 102C138 98 124 104 116 112C128 110 140 110 150 108C160 110 172 110 184 112C176 104 162 98 150 102Z', '#F5EBD8', 2)
                + (pen.detail('<ellipse cx="150" cy="116" rx="7" ry="5" fill="#2A1E16"/>') if kind in ('open', 'big') else ''))
        o.append(part('head', head + crown))
        if p == 'crack':
            o.append(part('crown-shard', pen.path('M206 30L220 26L224 40L210 44Z', '#E3A41C', 2.2)
                          + pen.detail('<path d="M196 20l6 4M228 24l8-4M226 48l8 6" stroke="#F7D046" stroke-width="2.5" stroke-linecap="round"/>')))
        # sword: pivot at hands (150,168); idle tip down to floor
        sword = (pen.path('M-9 10V108L0 124L9 108V10Z', '#5A4E6A') + pen.line('M0 14V108', 1.8, '#8E80A6')
                 + pen.rect(-26, -2, 52, 12, 4, '#E3A41C', 2.4) + pen.rect(-5, -30, 10, 30, 4, '#3A2E44', 2.2)
                 + pen.circle(0, -34, 7, '#C8473A', 2.2))
        o.append(part('sword', f'<g transform="translate({150 + sw_dx} {168 + sw_dy}) rotate({sw_rot})">{sword}</g>'))
        o.append(part('hands', pen.circle(140, 166 + hands_dy, 11, '#3A2E44') + pen.circle(160, 166 + hands_dy, 11, '#3A2E44')))
        if p in ('p1-big', 'p2-big'):
            o.append(part('sparks', pen.detail('<g fill="#8E6CB0" stroke="#2A1E16" stroke-width="1.6"><path d="M96 40l5 10 10 4-10 4-5 10-5-10-10-4 10-4z"/><path d="M210 70l4 8 8 3-8 3-4 8-4-8-8-3 8-3z"/></g>')))
        if p == 'p2-open':
            o.append(part('hand-crown', pen.circle(196, 74, 11, '#3A2E44')))
        return part('DK01', ''.join(o))
    return _mk(fn, 300, 300)


ENEMIES = {'EN01': en01, 'EN02': en02, 'EN03': en03, 'EN04': en04, 'EN05': en05, 'EN06': en06, 'EN07': en07,
           'EN08': en08, 'EN09': en09, 'EN10': en10, 'EN11': en11, 'EN12': en12, 'EN13': en13}
