plate = 3.0
core = cq.Workplane('XY').box(46, 10, 46, centered=(True, False, True)).translate((0, plate, 0))
bottom = cq.Workplane('XY').box(50, plate, 50, centered=(True, False, True))
top = cq.Workplane('XY').box(50, plate, 50, centered=(True, False, True)).translate((0, 16 - plate, 0))
body = bottom.union(core).union(top)
shaft = cq.Workplane('XY').add(cq.Solid.makeCylinder(2.5, 5.0, cq.Vector(0, 16, 0), cq.Vector(0, 1, 0)))
part = body.union(shaft)
for x in (-20.5, 20.5):
    for z in (-20.5, 20.5):
        h = cq.Workplane('XY').add(cq.Solid.makeCylinder(1.25, 3.0, cq.Vector(x, 13, z), cq.Vector(0, 1, 0)))
        part = part.cut(h)