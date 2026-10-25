def gear(n, ro, rr, z0, th):
    p = 2 * math.pi / n
    pts = []
    for i in range(n):
        a = i * p
        for r, d in ((rr, -0.25), (ro, -0.13), (ro, 0.13), (rr, 0.25)):
            pts.append((r * math.cos(a + d * p), r * math.sin(a + d * p)))
    return cq.Workplane('XY').workplane(offset=z0).polyline(pts).close().extrude(th)

large = gear(48, 20.0, 18.2, -8.0, 6.0)
pinion = gear(16, 7.0, 5.6, -2.0, 10.0)
body = large.union(pinion)
bore = cq.Workplane('XY').workplane(offset=-8.0).circle(2.0).extrude(16.0)
part = body.cut(bore).translate((0, 20.0, 0))