def cyl(d, z0, z1):
    return cq.Workplane('XY').workplane(offset=z0).center(0, 18).circle(d / 2).extrude(z1 - z0)

cap = cyl(36, -50, -38)
can = cyl(36, -38, -4)
gearbox = cyl(36, -4, 26)
shaft = cyl(8, 26, 50)
part = cap.union(can).union(gearbox).union(shaft)