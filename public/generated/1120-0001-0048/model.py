outer = cq.Workplane('XY').box(48, 48, 48, centered=(True, False, True))
inner = cq.Workplane('XY').box(50, 48, 43, centered=(True, False, True)).translate((0, 2.5, 0))
part = outer.cut(inner)