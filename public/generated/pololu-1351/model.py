pts = [(-2.03, 8.51), (12.57, -8.0)]
plate = cq.Workplane('XZ').rect(30.48, 21.59).extrude(-1.6)
holes = cq.Workplane('XZ').pushPoints(pts).circle(1.09).extrude(-1.6)
part = plate.cut(holes)