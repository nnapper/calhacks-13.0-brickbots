r = 23.05
t = 2.4
body = cq.Workplane('XY').circle(24.6).extrude(t)
gap = (cq.Workplane('XY').center(r, 0).circle(2.7).extrude(t)
       .union(cq.Workplane('XY').polyline([(r, -2.7), (26, -4.0), (26, 4.0), (r, 2.7)]).close().extrude(t)))
for i in range(18):
    body = body.cut(gap.rotate((0, 0, 0), (0, 0, 1), i * 20))
body = body.cut(cq.Workplane('XY').circle(7).extrude(t))
body = body.cut(cq.Workplane('XY').pushPoints([(8, 8), (-8, 8), (-8, -8), (8, -8)]).circle(2).extrude(t))
part = body.rotate((0, 0, 0), (1, 0, 0), -90)