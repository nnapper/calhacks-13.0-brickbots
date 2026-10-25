tire = cq.Workplane('XY').circle(45).circle(41).extrude(5, both=True)
rim = cq.Workplane('XY').circle(41.5).circle(38.5).extrude(4, both=True)
hub = cq.Workplane('XY').circle(6.5).extrude(3.5, both=True)
spokes = None
for a in (0, 60, 120):
    s = (cq.Workplane('XY').box(78, 4, 4)
         .rotate((0, 0, 0), (0, 0, 1), a))
    spokes = s if spokes is None else spokes.union(s)
body = tire.union(rim).union(spokes).union(hub)
bore = cq.Workplane('XY').circle(2.9).extrude(6, both=True)
part = body.cut(bore).translate((0, 45, 0))