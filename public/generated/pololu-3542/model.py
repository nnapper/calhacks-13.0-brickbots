board = cq.Workplane('XY').box(22.5, 18.5, 1.6)
board = board.faces('>Z').workplane().pushPoints([(0, -1)]).hole(4)
pads = [(-7.62 + 2.54 * i, 8) for i in range(6)]
board = board.faces('>Z').workplane().pushPoints(pads).hole(1)
part = board.translate((0, 9.25, 0))