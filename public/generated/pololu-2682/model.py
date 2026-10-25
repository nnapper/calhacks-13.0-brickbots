d = 12 / math.cos(math.radians(30))
body = cq.Workplane('XY').polygon(6, d).extrude(17).translate((0, 6, -8.5))
bore = cq.Solid.makeCylinder(1.5, 9.5, cq.Vector(0, 6, 8.5), cq.Vector(0, 0, -1))
m4 = cq.Solid.makeCylinder(2.0, 7, cq.Vector(0, 6, -8.5), cq.Vector(0, 0, 1))
part = body.cut(cq.Workplane('XY').add(bore)).cut(cq.Workplane('XY').add(m4))
for z in (5.75, 1.25):
    s = cq.Solid.makeCylinder(1.5, 6.5, cq.Vector(0, 12.5, z), cq.Vector(0, -1, 0))
    part = part.cut(cq.Workplane('XY').add(s))