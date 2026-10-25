t = 0.8
board = cq.Workplane('XY').box(10.2, t, 20, centered=(True, False, True))
# holes through the board along Y
mount = cq.Workplane('XZ').center(0, 7.7).circle(1.2).extrude(-t)
pins = (cq.Workplane('XZ')
        .pushPoints([(-3.81, -8.9), (-1.27, -8.9), (1.27, -8.9), (3.81, -8.9), (3.81, -6.35)])
        .circle(0.5).extrude(-t))
board = board.cut(mount).cut(pins)
# two QTR sensor bodies at 4 mm pitch, top height 2.5 mm
h = 2.5 - t
sensors = (cq.Workplane('XY').workplane(offset=t)
           .pushPoints([(-2.2, 3.5), (-2.2, -0.5)])
           .rect(3.2, 3.6).extrude(h))
# workplane XY normal is Z, so rebuild sensors with Y as up
sensors = (cq.Workplane('XZ', origin=(0, t, 0))
           .pushPoints([(-2.2, 3.5), (-2.2, -0.5)])
           .rect(3.2, 3.6).extrude(-h))
part = board.union(sensors)