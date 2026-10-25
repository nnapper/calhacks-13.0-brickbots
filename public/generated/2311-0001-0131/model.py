p = math.pi * 0.8
L = 131 * p
x0 = -L / 2
root = 10.2
pts = [(x0, 0), (x0 + L, 0), (x0 + L, root)]
for i in range(130, -1, -1):
    xs = x0 + i * p
    pts += [(xs + 0.85 * p, root), (xs + 0.65 * p, 12), (xs + 0.35 * p, 12), (xs + 0.15 * p, root)]
pts.append((x0, root))
body = cq.Workplane('XY').polyline(pts).close().extrude(4, both=True)
holes = cq.Workplane('XY').pushPoints([(-160 + 8 * k, 6) for k in range(41)]).circle(2).extrude(5, both=True)
part = body.cut(holes)