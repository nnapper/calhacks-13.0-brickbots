v = cq.Workplane('XY').box(2.5, 12, 8, centered=(False, False, True)).translate((-6, 0, 0))
h = cq.Workplane('XY').box(12, 2.5, 8, centered=(False, False, True)).translate((-6, 0, 0))
hole = cq.Workplane('YZ').workplane(offset=-7).center(8, 0).circle(2).extrude(4)
part = v.union(h).cut(hole)