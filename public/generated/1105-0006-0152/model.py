part = cq.Workplane('XZ').slot2D(152, 32).extrude(-2.5)
holes = cq.Workplane('XZ').pushPoints([(x, 0) for x in (-60, -36, -12, 12, 36, 60)]).circle(7).extrude(-2.5)
part = part.cut(holes)