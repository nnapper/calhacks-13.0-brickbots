tire = cq.Workplane('XY').circle(40).circle(36).extrude(10)
rim = cq.Workplane('XY').workplane(offset=2).circle(37).circle(33).extrude(6)
hub = cq.Workplane('XY').circle(13).extrude(10)
body = tire.union(rim).union(hub)
for a in (0, 60, 120):
    spoke = cq.Workplane('XY').box(70, 3, 6).translate((0, 0, 5)).rotate((0, 0, 0), (0, 0, 1), a)
    body = body.union(spoke)
body = body.cut(cq.Workplane('XY').circle(4.5).extrude(10))
part = body.rotate((0, 0, 0), (1, 0, 0), -90)