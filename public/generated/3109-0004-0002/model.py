body = cq.Workplane('XY').box(40, 14, 40, centered=(True, False, True))
holes = None
for x in (-16, 16):
    for z in (-16, 16):
        h = cq.Workplane('XY').add(cq.Solid.makeCylinder(2.1, 14, cq.Vector(x, 0, z), cq.Vector(0, 1, 0)))
        body = body.cut(h)
knob = cq.Solid.makeCylinder(7, 5, cq.Vector(0, 14, 0), cq.Vector(0, 1, 0))
part = body.union(cq.Workplane('XY').add(knob))
for z in (-9, -3, 3, 9):
    b = cq.Solid.makeCylinder(2, 1.5, cq.Vector(14, 14, z), cq.Vector(0, 1, 0))
    part = part.union(cq.Workplane('XY').add(b))