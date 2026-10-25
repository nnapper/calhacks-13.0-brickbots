body = cq.Workplane('XY').box(40, 37, 20, centered=(True, False, True))
flange = cq.Workplane('XY').box(54.5, 4, 20, centered=(True, False, True)).translate((0, 31, 0))
part = body.union(flange)
shaft = cq.Workplane('XY').add(cq.Solid.makeCylinder(3.5, 5, cq.Vector(-12, 37, 0), cq.Vector(0, 1, 0)))
part = part.union(shaft)
for x in (-24.75, 24.75):
    for z in (-5, 5):
        h = cq.Solid.makeCylinder(2.25, 10, cq.Vector(x, 28, z), cq.Vector(0, 1, 0))
        part = part.cut(cq.Workplane('XY').add(h))