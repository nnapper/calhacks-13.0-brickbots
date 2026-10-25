t = 1.6
board = cq.Workplane('XY').box(20.3, t, 17.8, centered=(True, False, True))
mount = cq.Workplane('XZ').pushPoints([(8, 6.4), (8, -6.4)]).circle(1.1).extrude(-t)
pins = cq.Workplane('XZ').pushPoints([(6, 2.54), (6, 0), (6, -2.54)]).circle(0.5).extrude(-t)
part = board.cut(mount).cut(pins)