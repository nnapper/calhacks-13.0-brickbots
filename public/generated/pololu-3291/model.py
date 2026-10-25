part = cq.Workplane('XY').box(41, 15, 23, centered=(True, False, True))
for i in range(9):
    g = cq.Workplane('XY').box(1.5, 4.5, 25, centered=(True, False, True)).translate((-16 + 4 * i, 11, 0))
    part = part.cut(g)
