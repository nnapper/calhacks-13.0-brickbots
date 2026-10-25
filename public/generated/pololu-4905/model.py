tire = cq.Workplane('XY').circle(20).circle(17.5).extrude(7).translate((0,0,-3.5))
rim = cq.Workplane('XY').circle(17.6).circle(15.5).extrude(5).translate((0,0,-2.5))
hub = cq.Workplane('XY').circle(4.5).extrude(6).translate((0,0,-3))
body = tire.union(rim).union(hub)
for a in (90, 210, 330):
    spoke = cq.Workplane('XY').box(15, 3, 4).translate((9, 0, 0)).rotate((0,0,0),(0,0,1),a)
    body = body.union(spoke)
bore = cq.Workplane('XY').circle(2.4).extrude(10).translate((0,0,-5))
part = body.cut(bore).translate((0,20,0))