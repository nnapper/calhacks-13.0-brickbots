outer = cq.Workplane('XY').box(12, 12, 8, centered=(True, False, True))
slot = cq.Workplane('XY').box(8, 11, 8, centered=(True, False, True)).translate((0, 1.5, 0))
hole = cq.Workplane('YZ').center(8, 0).circle(2).extrude(7, both=True)
part = outer.cut(slot).cut(hole)