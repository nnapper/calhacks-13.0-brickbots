web = cq.Workplane('XY').box(48, 72, 4, centered=(True, False, True))
flange = cq.Workplane('XY').box(48, 8, 16, centered=(True, False, True))
part = web.union(flange).union(flange.translate((0, 64, 0)))
bore = cq.Workplane('XY').cylinder(20, 7).translate((0, 36, 0))
part = part.cut(bore)
for x0 in (-24, 16):
    for y in (4, 68):
        for z in (-4, 4):
            h = cq.Solid.makeCylinder(1.65, 8, cq.Vector(x0, y, z), cq.Vector(1, 0, 0))
            part = part.cut(cq.Workplane('XY').add(h))
