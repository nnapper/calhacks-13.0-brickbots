t = 0.254
L = 35.56
r = 3.81
xc = -L/2 + r
pad = cq.Workplane('XZ').center(xc, 0).circle(r).extrude(-t)
x0, x1 = xc, 14.5
tail = cq.Workplane('XY').box(x1 - x0, t, 5.5, centered=(False, False, True)).translate((x0, 0, 0))
pins = cq.Workplane('XY')
for z in (-1.27, 1.27):
    pin = cq.Workplane('XY').box(L/2 - 13.5, t, 1.2, centered=(False, False, True)).translate((13.5, 0, z))
    pins = pins.union(pin)
part = pad.union(tail).union(pins)