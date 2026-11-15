"""Hero (viewBox 120x160, faces right, feet y=152) and companions (viewBox 100x140, feet y=134)."""
from common import P
from pen import part, face

OUTFIT = {
    'traveler': {'tunic': '#8FAF6A', 'trim': '#6E8C4E', 'leg': '#5B4636'},
    'warrior': {'tunic': '#B5583A', 'trim': '#8A3F28', 'leg': '#4F4A52'},
    'mage': {'tunic': '#3E4F8A', 'trim': '#2D3A68', 'leg': '#2D3A68'},
    'bard': {'tunic': '#3E8C8C', 'trim': '#2C6B6B', 'leg': '#5B4636'},
}


def sword(pen, big=False, gold=False):
    L = 46 if big else 38
    blade = '#F2E3A6' if gold else '#E8EEF2'
    return (pen.path(f'M-3 -4V{-L + 6}L0 {-L}L3 {-L + 6}V-4Z', blade, 2.2)
            + pen.detail(f'<path d="M0 -6V{-L + 8}" stroke="#AEBBC4" stroke-width="1.4"/>')
            + pen.rect(-9, -6, 18, 5, 2, P['act'] if not gold else '#E3A41C', 2)
            + pen.rect(-2.5, -1, 5, 11, 2, P['leather'], 2)
            + pen.circle(0, 12, 3.2, P['act'], 1.8))


def hero(outfit='traveler', pose='idle', sword_gold=False):
    def fn(pen, _pose=pose):
        p = _pose
        o = OUTFIT[outfit]
        out = []
        # pose table -------------------------------------------------------
        T = {'arm-front': 0, 'weapon': 35, 'leg-front': 0, 'leg-back': 0, 'body-dy': 0, 'lean': 0, 'arm-back': 0}
        fk = 'idle'
        if p == 'walk1':
            T.update({'leg-front': -22, 'leg-back': 18, 'body-dy': -2, 'arm-back': 15})
        elif p == 'walk2':
            T.update({'leg-front': 18, 'leg-back': -20, 'body-dy': -2, 'arm-back': -15})
        # NOTE weapon angle is relative to the arm: absolute = arm + weapon.
        elif p == 'attack':     # forward slash: arm at shoulder height, blade forward
            T.update({'arm-front': -60, 'weapon': 140, 'lean': 7, 'leg-front': -18, 'leg-back': 12})
            fk = 'attack'
        elif p == 'guard':      # blade held up-forward, crouch, shield-shaped light in front
            T.update({'arm-front': -38, 'weapon': 68, 'body-dy': 3})
            fk = 'attack'
        elif p == 'cast':       # sword raised like a wand, spark at the tip
            T.update({'arm-front': -78, 'weapon': 78, 'lean': 4})
            fk = 'attack'
        elif p == 'hit':
            T.update({'lean': -10, 'arm-front': 20})
            fk = 'hit'
        elif p == 'victory':
            T.update({'arm-front': -165, 'weapon': 175, 'body-dy': -3})
        elif p == 'down':
            T.update({'leg-front': -80, 'leg-back': -70, 'body-dy': 22, 'arm-front': 30, 'weapon': 140})
            fk = 'guard'
        dy = T['body-dy']
        # cape / back items ----------------------------------------------
        back = []
        if outfit == 'traveler':
            back.append(part('cape', pen.path('M50 78C40 94 33 112 29 130L58 126L62 80Z', '#A0623A')))
        if outfit == 'bard':
            back.append(part('lute', pen.line('M42 98L28 66', 4) + pen.ellipse(40, 104, 11, 14, '#C98E52', 2.5, rot=-25)
                             + pen.detail('<circle cx="40" cy="104" r="3.5" fill="#5B3A22"/>')))
        if outfit == 'warrior':
            back.append(part('cape', pen.path('M50 78C42 96 38 112 36 126L58 122L62 80Z', '#8A3F28')))
        out.append(''.join(back))
        # legs ----------------------------------------------------------------
        if outfit == 'mage':
            legs = (part('leg-back', pen.ellipse(55, 146, 9, 6, '#4A2F22', 2.5), rot=T['leg-back'], pivot=(56, 118))
                    + part('leg-front', pen.ellipse(71, 147, 10, 6, '#4A2F22', 2.5), rot=T['leg-front'] * .3, pivot=(69, 118)))
        else:
            legs = (part('leg-back', pen.rect(50, 116, 12, 30, 6, o['leg'], 2.5) + pen.ellipse(55, 147, 9, 6, '#6B3F22', 2.5),
                         rot=T['leg-back'], pivot=(56, 118))
                    + part('leg-front', pen.rect(63, 116, 12, 30, 6, o['leg'], 2.5) + pen.ellipse(71, 148, 10, 6, '#6B3F22', 2.5),
                           rot=T['leg-front'], pivot=(69, 118)))
        # arm back -------------------------------------------------------------
        armb = part('arm-back', pen.ellipse(47, 98, 6, 13, o['trim'], 2.5, rot=12) + pen.circle(44, 111, 5, P['skin'], 2.5),
                    rot=T['arm-back'], pivot=(50, 86))
        # body ---------------------------------------------------------------
        if outfit == 'mage':
            bodyshape = pen.path('M44 78Q60 72 78 78L88 140Q62 148 34 140Z', o['tunic'])
            deco = pen.detail('<g fill="#F7D046"><circle cx="52" cy="112" r="2"/><circle cx="70" cy="126" r="2.2"/><circle cx="60" cy="96" r="1.8"/><circle cx="76" cy="104" r="1.6"/></g>')
            belt = pen.rect(40, 104, 44, 6, 3, P['act'], 2)
        else:
            bodyshape = pen.path('M44 78Q60 72 78 78L84 122Q62 130 38 122Z', o['tunic'])
            deco = ''
            if outfit == 'bard':
                deco = pen.detail('<path d="M50 84l6 9-6 9-6-9zM70 86l6 9-6 9-6-9z" fill="#F3E3C3" stroke="#2A1E16" stroke-width="1.4"/>')
            if outfit == 'warrior':
                deco = pen.path('M48 82Q61 78 74 82L76 104Q61 110 46 104Z', P['steel'], 2.2)
            belt = pen.rect(40, 106, 44, 6, 3, P['leather'], 2) + pen.rect(58, 105, 8, 8, 2, P['act'], 1.8)
        satchel = ''
        if outfit == 'traveler':
            satchel = pen.line('M74 80L46 108', 2.5, '#6B3F22') + pen.rect(34, 106, 16, 14, 4, '#B07A44', 2.2)
        body = part('body', bodyshape + deco + belt + satchel)
        # scarf (party colour) -------------------------------------------------
        scarf = part('scarf', pen.path('M50 82C38 80 28 74 20 70C24 78 26 84 22 92C32 90 42 88 52 88Z', P['act'], 2.5)
                     + pen.path('M45 76Q62 70 80 76L79 84Q62 79 46 84Z', P['act'], 2.5))
        # head -----------------------------------------------------------------
        head = [pen.circle(62, 52, 26, P['skin'])]
        head.append(pen.ellipse(47, 55, 4.5, 6, P['skin'], 2.2))
        if outfit != 'warrior':
            head.append(pen.path('M36 54C35 31 50 22 66 24C81 25 89 35 88 47C80 41 70 39 62 41C54 43 47 49 45 60Z', P['hair'], 2.5))
        head.append(pen.detail(face(pen, fk, [(70, 54), (81, 53)], 3.4, (77, 64, 7), look=1)))
        head.append(pen.detail(f'<ellipse cx="65" cy="63" rx="4" ry="2.4" fill="{P["cheek"]}" opacity=".8"/><ellipse cx="85" cy="62" rx="3" ry="2.2" fill="{P["cheek"]}" opacity=".8"/>'))
        # headgear ---------------------------------------------------------------
        if outfit == 'traveler':
            hat = (pen.ellipse(60, 33, 35, 7.5, '#C9A36B', 2.5, rot=-5)
                   + pen.path('M44 33C44 18 52 11 61 11C70 11 77 18 77 31Z', '#C9A36B', 2.5)
                   + pen.path('M44.5 28Q61 24 76.5 26L77 31Q61 29 44 33Z', '#A0623A', 2))
            cow = pen.line('M70 27q4-5 0-8', 2.5, P['hair'])
        elif outfit == 'warrior':
            hat = (pen.path('M35 52C35 29 49 20 63 20C78 20 89 31 89 49L89 55L35 55Z', P['steel'], 2.5)
                   + pen.rect(33, 46, 58, 8, 3, '#8D9AA5', 2.2)
                   + pen.path('M48 22C50 8 66 2 84 10C76 12 68 16 62 22Z', P['act'], 2.5))
            cow = ''
            head.append(pen.circle(76, 84, 10, P['steel'], 2.5))
        elif outfit == 'mage':
            hat = (pen.ellipse(60, 33, 32, 7, '#3E4F8A', 2.5, rot=-5)
                   + pen.path('M43 33C48 22 56 6 70 -6C70 4 80 2 86 6C78 8 76 18 78 31Z', '#3E4F8A', 2.5)
                   + pen.path('M62 16l2 4 4 .6-3 2.8.8 4.2-3.8-2-3.8 2 .8-4.2-3-2.8 4-.6z', '#F7D046', 1.5))
            cow = ''
        else:  # bard
            hat = (pen.path('M37 40C30 30 24 20 22 10C34 14 46 22 60 30Z', '#3E8C8C', 2.5)
                   + pen.path('M60 30C72 20 84 12 96 8C94 20 90 32 86 42Z', '#E58E3C', 2.5)
                   + pen.path('M36 44C42 30 78 28 88 42L86 47C76 38 46 38 38 48Z', '#F3E3C3', 2.2)
                   + pen.circle(22, 10, 4.5, P['act'], 2) + pen.circle(96, 8, 4.5, P['act'], 2))
            cow = ''
        headg = part('head', ''.join(head) + part('hat', hat) + (part('cowlick', cow) if cow else ''))
        # front arm + weapon -------------------------------------------------------
        wpn = f'<g data-part="weapon" transform="translate(86 108) rotate({T["weapon"]})">{sword(pen, big=(outfit == "warrior"), gold=sword_gold)}</g>'
        armf = part('arm-front', pen.ellipse(79, 96, 6.5, 13.5, o['trim'], 2.5, rot=-22) + wpn + pen.circle(86, 108, 5.5, P['skin'], 2.5),
                    rot=T['arm-front'], pivot=(74, 86))
        fx = ''
        if p == 'guard':
            fx = part('fx-guard', pen.detail(f'<path d="M100 70l14 5v14c0 12-8 20-14 23-6-3-14-11-14-23V75z" fill="rgba(157,180,200,.45)" stroke="{P["num-block"]}" stroke-width="2.5" stroke-dasharray="5 3"/>'))
        if p == 'attack':
            fx = part('fx-slash', pen.detail('<path d="M104 30C134 44 142 82 122 112C130 82 124 56 104 30Z" fill="#fff" stroke="#2A1E16" stroke-width="2"/>'))
        if p == 'cast':
            fx = part('fx-cast', pen.detail('<path d="M99 12l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#BFA3E0" stroke="#2A1E16" stroke-width="1.8"/><circle cx="114" cy="38" r="3" fill="#F7D046" stroke="#2A1E16" stroke-width="1.4"/><circle cx="84" cy="30" r="2.4" fill="#F7D046" stroke="#2A1E16" stroke-width="1.4"/>'))
        whole = ''.join([legs, armb, body, scarf, headg, armf, fx])
        lean = T['lean']
        return part('hero', ''.join(out) + whole, rot=lean, pivot=(60, 150), dy=dy)
    fn.W, fn.H = 120, 160
    return fn


def companion(role, pose='idle'):
    """role: shield | medic | archer | lantern  (archer/lantern = provisional roles)."""
    def fn(pen, _pose=pose):
        p = _pose
        fk = 'idle' if p != 'support' else 'attack'
        o = []
        if role == 'shield':
            o.append(pen.rect(35, 106, 12, 22, 5, '#4F4A52', 2.5) + pen.rect(52, 106, 12, 22, 5, '#4F4A52', 2.5))
            o.append(pen.ellipse(40, 130, 9, 5.5, '#6B3F22', 2.5) + pen.ellipse(58, 130, 9, 5.5, '#6B3F22', 2.5))
            o.append(part('body', pen.ellipse(49, 88, 29, 25, '#B5583A') + pen.path('M24 96Q49 108 74 96L72 106Q49 118 26 106Z', '#8D9AA5', 2.2)))
            o.append(part('scarf', pen.path('M32 66Q48 60 66 66L64 74Q48 69 34 74Z', P['act'], 2.5)))
            head = (pen.circle(48, 50, 17, P['skin']) + pen.path('M36 56Q48 74 62 56Q58 66 48 68Q40 66 36 56Z', '#7A4A2A', 2.2)
                    + pen.detail(face(pen, fk, [(52, 50), (60, 49)], 2.7, None, look=1))
                    + part('hat', pen.path('M29 50C29 30 67 30 67 50Z', P['steel'], 2.5) + pen.rect(27, 46, 42, 6, 3, '#8D9AA5', 2) + pen.line('M55 50V60', 3)))
            o.append(part('head', head))
            sdx, sdy = (10, -14) if p == 'support' else (0, 0)
            o.append(part('shield', pen.circle(70, 92, 25, '#9DB4C8') + pen.circle(70, 92, 19, 'none', 2.2, '#5E7A92')
                          + pen.circle(70, 92, 6, P['act'], 2.2)
                          + pen.detail('<g fill="#2A1E16"><circle cx="70" cy="76" r="1.8"/><circle cx="70" cy="108" r="1.8"/><circle cx="54" cy="92" r="1.8"/><circle cx="86" cy="92" r="1.8"/></g>'),
                          dx=sdx, dy=sdy))
        elif role == 'medic':
            o.append(part('bottle', pen.line('M60 66L34 100', 3, '#6B3F22') + pen.rect(26, 40, 9, 14, 3, '#C9A36B', 2.2)
                          + pen.circle(30, 68, 16, '#8CCBC3') + pen.detail('<path d="M22 62a9 9 0 017-6" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><path d="M18 74q12 6 24 0" stroke="#4E9C93" stroke-width="2" fill="none"/>')))
            o.append(pen.rect(40, 110, 9, 18, 4, '#5B4636', 2.2) + pen.rect(53, 110, 9, 18, 4, '#5B4636', 2.2))
            o.append(pen.ellipse(44, 130, 7, 5, '#6B3F22', 2.2) + pen.ellipse(58, 130, 7, 5, '#6B3F22', 2.2))
            o.append(part('body', pen.path('M38 68Q51 63 64 68L70 116Q51 122 32 116Z', '#8FAF8A') + pen.path('M44 76H60L64 114Q52 118 40 114Z', '#F3E3C3', 2)))
            o.append(part('scarf', pen.path('M38 66Q51 60 64 66L63 73Q51 68 39 73Z', P['act'], 2.5)))
            head = (pen.circle(51, 48, 16, P['skin']) + pen.path('M34 46C34 30 68 28 68 44C60 40 44 40 34 46Z', '#E07A5F', 2.5)
                    + pen.path('M34 44C26 44 22 50 22 56C28 52 32 50 36 50Z', '#E07A5F', 2.2)
                    + pen.detail(face(pen, fk, [(55, 50), (63, 49)], 2.6, (59, 57, 5), look=1)))
            o.append(part('head', head))
            hdy = -18 if p == 'support' else 0
            o.append(part('herb', pen.line('M70 98L76 84', 2.5) + pen.ellipse(78, 80, 6, 3.5, P['k-heal'], 2, rot=-40)
                          + pen.ellipse(72, 82, 5, 3, '#A9D48E', 2, rot=30) + pen.circle(68, 100, 4.5, P['skin'], 2.2), dy=hdy))
            if p == 'support':
                o.append(pen.detail('<path d="M86 60l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#A9D48E" stroke="#2A1E16" stroke-width="1.6"/>'))
        elif role == 'archer':
            o.append(part('quiver', pen.rect(26, 62, 11, 34, 4, '#8A5A2B', 2.2, rot=(-15, 31, 79)) + pen.detail('<path d="M24 60l-3-7M30 58l0-8M35 59l3-7" stroke="#2A1E16" stroke-width="2"/>')))
            o.append(pen.rect(41, 100, 8, 28, 4, '#5B4636', 2.2) + pen.rect(53, 100, 8, 28, 4, '#5B4636', 2.2))
            o.append(pen.ellipse(45, 130, 7, 4.5, '#6B3F22', 2.2) + pen.ellipse(58, 130, 7, 4.5, '#6B3F22', 2.2))
            o.append(part('body', pen.path('M38 62Q50 58 62 62L64 104Q50 108 36 104Z', '#4F7A4A')))
            o.append(part('scarf', pen.path('M38 62Q50 56 62 62L61 69Q50 64 39 69Z', P['act'], 2.5)))
            head = (pen.circle(50, 42, 15, P['skin'])
                    + pen.detail(face(pen, fk, [(54, 44), (62, 43)], 2.5, (58, 51, 4), look=1))
                    + part('hat', pen.path('M34 40C36 24 56 20 66 30C56 30 46 30 34 40Z', '#3F6B3A', 2.5)
                           + pen.path('M36 34C24 26 18 16 20 8C28 16 34 24 40 30Z', '#C8473A', 2.2)))
            o.append(part('head', head))
            bow_rot = -8 if p == 'support' else 0
            o.append(part('bow', pen.path('M70 22Q92 72 70 122', 'none', 3.2, '#8A5A2B') + pen.line('M70 22V122', 1.4)
                          + pen.circle(70, 74, 4.5, P['skin'], 2.2), rot=bow_rot, pivot=(70, 74)))
        elif role == 'lantern':
            ldy = -12 if p == 'support' else 0
            o.append(part('pole', pen.line('M72 112V10', 4.5, '#2A1E16') + pen.line('M72 112V10', 2, '#C99D6A')
                          + pen.path('M64 8h16l-2 6H66z', '#5E6A74', 2) + pen.rect(65, 14, 14, 16, 3, '#FBE7A6', 2)
                          + pen.detail('<path d="M72 27c-3 0-4-2-4-4 0-2.5 4-4 4-7 1 3 4 4.5 4 7 0 2-1 4-4 4z" fill="#F29A3A"/>')
                          + pen.path('M65 30h14l-2 4H67z', '#5E6A74', 2), dy=ldy))
            o.append(pen.ellipse(42, 130, 8, 5, '#6B3F22', 2.2) + pen.ellipse(58, 130, 8, 5, '#6B3F22', 2.2))
            o.append(part('body', pen.path('M34 62Q50 54 66 62L74 126Q50 134 26 126Z', '#7A5C8E')))
            o.append(part('scarf', pen.path('M36 62Q50 56 64 62L63 69Q50 64 37 69Z', P['act'], 2.5)))
            head = (pen.path('M30 48C30 24 70 22 70 46L68 58H32Z', '#5E4470', 2.5) + pen.circle(51, 46, 14, P['skin'])
                    + pen.detail(face(pen, fk, [(53, 47), (62, 46)], 2.3, (58, 54, 4), look=1))
                    + pen.detail('<circle cx="53" cy="47" r="5" fill="none" stroke="#2A1E16" stroke-width="1.8"/><circle cx="64" cy="46" r="5" fill="none" stroke="#2A1E16" stroke-width="1.8"/><path d="M58 47h1" stroke="#2A1E16" stroke-width="1.8"/>'))
            o.append(part('head', head))
            o.append(pen.circle(72, 100 + ldy, 5, P['skin'], 2.2))
        return part(role, ''.join(o))
    fn.W, fn.H = 100, 140
    return fn
