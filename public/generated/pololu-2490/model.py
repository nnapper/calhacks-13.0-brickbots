pcb_t = 1.0
sens_h = 1.0
board = cq.Workplane('XY').box(12.7, pcb_t, 17.78, centered=(True, False, True))
mount_pts = [(-3.85, 6.35), (-3.85, -6.35)]
pin_pts = [(5.35, (i - 3) * 2.54) for i in range(7)]
mount = cq.Workplane('XZ').pushPoints(mount_pts).circle(2.18 / 2).extrude(-3)
pins = cq.Workplane('XZ').pushPoints(pin_pts).circle(0.5).extrude(-3)
board = board.cut(mount).cut(pins)
sensor = cq.Workplane('XY').box(2.4, sens_h, 4.4, centered=(True, False, True)).translate((-0.5, pcb_t, 0))
part = board.union(sensor)