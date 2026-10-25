housing = cq.Workplane('XY').box(30, 17, 20, centered=(True, False, True)).translate((0, 0, -5.5))
motor = cq.Workplane('XY').workplane(offset=4.5).center(0, 8.5).circle(7.5).extrude(11)
part = housing.union(motor)