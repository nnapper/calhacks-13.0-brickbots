body = cq.Workplane('XY').box(8.5, 3.7, 3.5, centered=(True, False, True))
slider = cq.Workplane('XY').box(1.5, 1.5, 3.0, centered=(True, False, False)).translate((0, 1.1, 1.75))
part = body.union(slider)
for x in (-2.54, 0, 2.54):
    pin = cq.Workplane('XY').box(0.5, 0.3, 3.2, centered=(True, True, False)).translate((x, 1.85, -4.75))
    part = part.union(pin)
