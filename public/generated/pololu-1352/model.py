bw, bl, t = 27.94, 36.07, 1.6
part = cq.Workplane('XY').box(bl, t, bw, centered=(True, False, True))
# mounting holes (approximate positions), axis along Y
holes = cq.Workplane('XZ').pushPoints([(15, 0.1), (-15.5, 8.2)]).circle(1.09).extrude(-5)
part = part.cut(holes)
# mini-USB connector on -X edge
usb = cq.Workplane('XY').box(9, 3.9, 7.7, centered=(True, False, True)).translate((-14, t, 0))
part = part.union(usb)
# two 3x6 male header blocks along the long edges
pins = []
for zc in (-8.66, 8.66):
    base = cq.Workplane('XY').box(15.24, 2.54, 7.62, centered=(True, False, True)).translate((3, t, zc))
    part = part.union(base)
    for i in range(6):
        for j in range(3):
            pins.append((3 + (i - 2.5) * 2.54, zc + (j - 1) * 2.54))
pinsol = cq.Workplane('XZ').workplane(offset=3).pushPoints(pins).rect(0.64, 0.64).extrude(-13.1)
part = part.union(pinsol)
