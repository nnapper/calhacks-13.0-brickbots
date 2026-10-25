yc=6.0
# X layout (total 44 mm, centered): shaft -22..-13, gearbox -13..-3.5, motor -3.5..11.5, encoder 11.5..22
def cyl(x0, L, d):
    return cq.Workplane('YZ').workplane(offset=x0).center(yc, 0).circle(d/2).extrude(L)
def box(x0, L, h, w, yc_=yc, zc=0):
    return cq.Workplane('XY').box(L, h, w, centered=(False, True, True)).translate((x0, yc_, zc))

# D-shaped output shaft, 3 mm dia, 9 mm long, flat on +Z side
shaft = cyl(-22, 9, 3).intersect(box(-22, 9, 3, 2.5, zc=-0.25 + 0.0).translate((0, 0, -0.0)))
shaft = cyl(-22, 9, 3).intersect(box(-22, 9, 4, 2.6, zc=-0.2))

# brass gearbox 12 (Y) x 10 (Z)
gearbox = box(-13, 9.5, 12, 10)

# motor can: 12 mm dia round with 10 mm wide flats
motor = cyl(-3.5, 15, 12).intersect(box(-3.5, 15, 12, 10))

# black encoder housing
enc = box(11.5, 10.5, 12, 10)

# side connector on +Z face of encoder housing
conn = box(13.0, 7.0, 6.0, 2.0, zc=5.0 + 1.0)

part = shaft.union(gearbox).union(motor).union(enc).union(conn)
