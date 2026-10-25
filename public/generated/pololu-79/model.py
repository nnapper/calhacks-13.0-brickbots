t = 2.0
plate = cq.Workplane('XY').box(160, t, 60, centered=(True, False, True))
holes = cq.Workplane('XZ').rarray(5, 5, 31, 11).circle(1.5).extrude(-t)
part = plate.cut(holes)