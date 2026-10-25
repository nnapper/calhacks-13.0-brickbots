pcb_t = 1.16
L = 17.78
W = 12.7
board = cq.Workplane('XY').box(L, pcb_t, W, centered=(True, False, True))

def cyl(x, z, d, h=pcb_t + 2):
    return cq.Workplane('XY').add(cq.Solid.makeCylinder(d / 2.0, h, cq.Vector(x, -1, z), cq.Vector(0, 1, 0)))

# mounting holes along the edge opposite the header
for x in (-6.35, 6.35):
    board = board.cut(cyl(x, -3.81, 2.18))

# 7 header pin holes at 0.1 in pitch along +Z edge
for i in range(7):
    x = (i - 3) * 2.54
    board = board.cut(cyl(x, 5.08, 1.0))

# ToF sensor module on top
sensor = cq.Workplane('XY').box(2.4, 1.0, 4.4, centered=(True, False, True)).translate((0, pcb_t, -0.5))

part = board.union(sensor)
