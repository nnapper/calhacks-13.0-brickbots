cy = 10.1
body = cq.Workplane('XY').workplane(offset=-22.5).center(0, cy).rect(20.2, 20.2).extrude(30)
pts = [(8, cy + 8), (-8, cy + 8), (8, cy - 8), (-8, cy - 8)]
holes = cq.Workplane('XY').workplane(offset=4).pushPoints(pts).circle(1.0).extrude(3.5)
body = body.cut(holes)
boss = cq.Workplane('XY').workplane(offset=7.5).center(0, cy).circle(7.5).extrude(1.5)
shaft = cq.Workplane('XY').workplane(offset=7.5).center(0, cy).circle(2.0).extrude(15)
part = body.union(boss).union(shaft)