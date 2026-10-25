t = 1.6
board = cq.Workplane('XY').box(65, t, 56, centered=(True, False, True)).edges('|Y').fillet(3.0)
holes = (cq.Workplane('XZ', origin=(0, t, 0))
         .pushPoints([(-29, -24.5), (29, -24.5), (-29, 24.5), (29, 24.5)])
         .circle(2.75 / 2).extrude(t))
part = board.cut(holes)