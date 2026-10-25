def cyl(d, z0, z1):
    return cq.Workplane('XY', origin=(0, 18.5, z0)).circle(d / 2).extrude(z1 - z0)

gearbox = cyl(37, -2, 26)
motor = cyl(35, -38, -2)
encoder = cyl(37, -50, -38)
shaft = cyl(8, 26, 50)
part = gearbox.union(motor).union(encoder).union(shaft)