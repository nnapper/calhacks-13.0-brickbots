yc = 18.5

def cyl(z0, h, d):
    return cq.Workplane('XY').workplane(offset=z0).center(0, yc).circle(d / 2).extrude(h)

# rear encoder cap, motor can, gearbox (axis along Z, centered on the 180 mm overall length)
encoder = cyl(-90, 15, 36)
motor = cyl(-75, 45, 36)
gearbox = cyl(-30, 40, 37)
# 8 mm output shaft, 80 mm long from the gearbox face at z=10 to the tip at z=90
shaft = cyl(10, 80, 8)

part = encoder.union(motor).union(gearbox).union(shaft)