part = cq.Workplane('XY').box(58, 15, 48, centered=(True, False, True))
for z in (-15.2, 0, 15.2):
    cell = cq.Workplane('XY').box(53, 13.5, 14, centered=(True, False, True)).translate((0, 2, z))
    part = part.cut(cell)
