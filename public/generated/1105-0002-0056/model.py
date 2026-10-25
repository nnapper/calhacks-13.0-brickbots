plate = cq.Workplane('XZ').slot2D(56, 32).extrude(-2.5)
bores = cq.Workplane('XZ').pushPoints([(-12, 0), (12, 0)]).circle(7).extrude(-2.5)
part = plate.cut(bores)