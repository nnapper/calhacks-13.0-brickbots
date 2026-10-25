base = cq.Workplane('XY').slot2D(56, 32).extrude(2.5)
holes = cq.Workplane('XY').pushPoints([(-12, 0), (12, 0)]).circle(7).extrude(2.5)
plate = base.cut(holes)
part = plate.rotate((0, 0, 0), (1, 0, 0), -90)