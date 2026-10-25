leaf_w, L, T = 13.0, 38.0, 8.0
left = cq.Workplane('XY').box(leaf_w, L, T, centered=(True, False, True)).translate((-9.5, 0, 0))
right = cq.Workplane('XY').box(leaf_w, L, T, centered=(True, False, True)).translate((9.5, 0, 0))
barrel = cq.Workplane('XZ').circle(4.0).extrude(-L)
body = left.union(right).union(barrel)
pts = [(x, 3 + 8 * i) for x in (-10, 10) for i in range(5)]
holes = cq.Workplane('XY', origin=(0, 0, T / 2)).pushPoints(pts).circle(1.7).extrude(-6)
part = body.cut(holes)