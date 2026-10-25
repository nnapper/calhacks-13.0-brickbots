def cyl(d, h, y0):
    return cq.Workplane(cq.Plane(origin=(0, y0, 0), xDir=(1, 0, 0), normal=(0, 1, 0))).circle(d / 2).extrude(h)

S = 42.3
L = 38.0
body = cq.Workplane('XY').box(S, L, S, centered=(True, False, True))
boss = cyl(22, 2, L)
screw = cyl(8, 182, L)
nut_barrel = cyl(10, 8, 90)
nut_flange = cyl(22, 3.5, 98)
part = body.union(boss).union(screw).union(nut_barrel).union(nut_flange)
for x in (-15.5, 15.5):
    for z in (-15.5, 15.5):
        h = cq.Workplane(cq.Plane(origin=(x, L - 4, z), xDir=(1, 0, 0), normal=(0, 1, 0))).circle(1.5).extrude(4)
        part = part.cut(h)
