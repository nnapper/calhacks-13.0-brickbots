R = 40
ring = cq.Workplane('XY').circle(R).circle(34).extrude(10).translate((0, 0, -5))
hub = cq.Workplane('XY').circle(9).extrude(6).translate((0, 0, -3))
body = ring.union(hub)
for a in (0, 60, 120):
    spoke = cq.Workplane('XY').box(70, 5, 4).rotate((0, 0, 0), (0, 0, 1), a)
    body = body.union(spoke)
pts = [(6.35 * math.cos(math.radians(60 * i)), 6.35 * math.sin(math.radians(60 * i))) for i in range(6)]
holes = cq.Workplane('XY').pushPoints(pts).circle(1.5).extrude(20).translate((0, 0, -10))
bore = cq.Workplane('XY').circle(1.5).extrude(20).translate((0, 0, -10))
body = body.cut(holes).cut(bore)
part = body.translate((0, 40, 0))