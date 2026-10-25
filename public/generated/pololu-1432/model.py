tire = cq.Workplane('XY').circle(40).circle(37).extrude(5, both=True)
rim = cq.Workplane('XY').circle(37.5).circle(34.5).extrude(4, both=True)
hub = cq.Workplane('XY').circle(13).extrude(4, both=True)
body = tire.union(rim).union(hub)
for a in (0, 60, 120):
    spoke = cq.Workplane('XY').box(70, 5, 4).rotate((0, 0, 0), (0, 0, 1), a)
    body = body.union(spoke)
pts = [(0, 0), (6.35, 0), (-6.35, 0), (9.55, 5.51), (-9.55, 5.51), (9.55, -5.51), (-9.55, -5.51)]
holes = cq.Workplane('XY').pushPoints(pts).circle(1.5).extrude(10, both=True)
body = body.cut(holes)
part = body.translate((0, 40, 0))