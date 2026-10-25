def cyl(x0, L, r, z, y=20):
    return cq.Workplane('YZ').workplane(offset=x0).center(y, z).circle(r).extrude(L)

rod = cyl(-375.5, 310, 8, -17)
tube = cyl(-75, 390.5, 16, -17)
motor = cyl(265.5, 80, 18, 17)
gear = cq.Workplane('XY').box(60, 40, 70, centered=(True, False, True)).translate((345.5, 0, 0))
hole = cq.Workplane('XZ').center(-367, -17).circle(4).extrude(50, both=True)
part = rod.union(tube).union(gear).union(motor).cut(hole)