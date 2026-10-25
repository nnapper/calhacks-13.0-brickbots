pw, pl, pt = 7.62, 8.89, 0.8
board = cq.Workplane('XY').box(pw, pt, pl, centered=(True, False, True))
for x in (-2.54, 0, 2.54):
    board = board.cut(cq.Workplane('XY').add(cq.Solid.makeCylinder(0.5, 2.0, cq.Vector(x, -0.5, -3.4), cq.Vector(0, 1, 0))))
ic = cq.Workplane('XY').box(2.9, 1.0, 1.6, centered=(True, False, True)).translate((0, pt, 1.8))
cap1 = cq.Workplane('XY').box(1.0, 0.9, 2.0, centered=(True, False, True)).translate((-2.7, pt, 1.0))
cap2 = cq.Workplane('XY').box(1.0, 0.9, 2.0, centered=(True, False, True)).translate((2.7, pt, 1.0))
cap3 = cq.Workplane('XY').box(2.0, 0.9, 1.0, centered=(True, False, True)).translate((-0.2, pt, -1.0))
part = board.union(ic).union(cap1).union(cap2).union(cap3)