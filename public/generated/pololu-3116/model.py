t = 1.6
board = cq.Workplane('XY').box(65, t, 56, centered=(True, False, True))
pts = [(-29, -24.5), (29, -24.5), (-29, 24.5), (29, 24.5)]
holes = cq.Workplane('XZ', origin=(0, -0.5, 0)).pushPoints(pts).circle(1.375).extrude(-(t + 1.0))
part = board.cut(holes)