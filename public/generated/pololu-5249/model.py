pts = [(sx*10.16, -22.86 + 2.54*i) for sx in (-1, 1) for i in range(19)]
board = cq.Workplane('XY').box(22.86, 1.6, 52.07, centered=(True, False, True))
board = board.rotate((0,0,0),(1,0,0),0)
holes = cq.Workplane('XZ').pushPoints(pts).circle(0.5).extrude(-3)
part = board.cut(holes)