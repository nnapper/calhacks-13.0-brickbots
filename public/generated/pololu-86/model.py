pts = [(-75 + 5*i, -25 + 5*j) for i in range(31) for j in range(11)]
plate = cq.Workplane('XY').box(160, 2, 60, centered=(True, False, True))
holes = cq.Workplane('XZ').workplane(offset=1).pushPoints(pts).circle(1.5).extrude(-4)
part = plate.cut(holes)