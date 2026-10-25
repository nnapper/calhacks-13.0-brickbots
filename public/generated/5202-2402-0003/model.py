def cyl(x0, d, L):
    return cq.Workplane('YZ').workplane(offset=x0).center(18, 0).circle(d/2).extrude(L)

yc = 18
# encoder cap, motor can, gearbox
cap = cyl(-62, 34, 16)
motor = cyl(-46, 36, 60)
gear = cyl(14, 36, 24)
# output shaft, 6 mm D, 24 mm long
shaft = cyl(38, 6, 24)
flat_cut = cq.Workplane('XY').box(24, 3, 8, centered=(False, True, True)).translate((38, yc + 2.5 + 1.5, 0))
shaft = shaft.cut(flat_cut)
part = cap.union(motor).union(gear).union(shaft)