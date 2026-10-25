body = cq.Workplane('XY').box(34, 13, 13.5, centered=(True, False, True))
ear = (cq.Workplane('XY').workplane(offset=-6.75).center(0, 3).rect(38.4, 6).extrude(2.5))
for sx in (-1, 1):
    ear = ear.union(cq.Workplane('XY').workplane(offset=-6.75).center(sx * 19.2, 3).circle(3.05).extrude(2.5))
conn = cq.Workplane('XY').box(10, 5.9, 5.75, centered=(True, False, True)).translate((0, 13, -3.875))
part = body.union(ear).union(conn)
part = part.cut(cq.Workplane('XY').workplane(offset=-8).pushPoints([(-19.2, 3), (19.2, 3)]).circle(1.5).extrude(6))