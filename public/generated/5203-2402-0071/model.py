def cyl(x0, length, d):
    return cq.Workplane('YZ').workplane(offset=x0).center(18.5, 0).circle(d / 2).extrude(length)

shaft = cyl(-71, 24.5, 8)
gearbox = cyl(-47, 40, 37)
can = cyl(-7, 52, 36)
cap = cyl(45, 26, 36)
part = shaft.union(gearbox).union(can).union(cap)