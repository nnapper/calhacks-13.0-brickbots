t = 4.0
plate = cq.Workplane('XY').box(43, t, 96, centered=(True, False, True))
holes = (cq.Workplane('XZ').pushPoints([(0, -32), (0, 0), (0, 32)]).circle(7.0).extrude(-t))
part = plate.cut(holes)