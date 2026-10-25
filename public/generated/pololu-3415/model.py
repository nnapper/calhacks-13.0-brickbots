t = 1.0
W = 12.7
L = 17.78
pcb = cq.Workplane('XY').box(W, t, L, centered=(True, False, True))

def cyl(d, x, z):
    return cq.Workplane('XY').add(cq.Solid.makeCylinder(d / 2.0, t + 2, cq.Vector(x, -1, z), cq.Vector(0, 1, 0)))

# two mounting holes (2.18 mm), 12.7 mm apart
for z in (-6.35, 6.35):
    pcb = pcb.cut(cyl(2.18, -3.7, z))

# 7 pin holes at 2.54 mm pitch along the opposite long edge
for i in range(7):
    pcb = pcb.cut(cyl(1.0, 5.2, (i - 3) * 2.54))

# ToF sensor module on top face
mod = cq.Workplane('XY').box(2.6, 1.0, 4.9, centered=(True, False, True)).translate((0.3, t, 0))

part = pcb.union(mod)
