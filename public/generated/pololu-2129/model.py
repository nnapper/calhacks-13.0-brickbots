t = 1.6
W, L = 10.16, 22.86
board = cq.Workplane('XY').box(W, t, L, centered=(True, False, True))
# through holes along Y (XZ workplane: local x=X, local y=Z, normal=-Y)
pin_pts = [(3.8, -10.16 + i * 2.54) for i in range(9)]
pins = (cq.Workplane('XZ').workplane(offset=1).pushPoints(pin_pts).circle(0.5).extrude(-4))
mount = (cq.Workplane('XZ').workplane(offset=1).center(-2.8, -9.2).circle(1.09).extrude(-4))
board = board.cut(pins).cut(mount)
# gyro IC (LGA)
ic = cq.Workplane('XY').workplane(offset=t).center(-0.5, -4.0).rect(3.5, 3.5).extrude(1.0)
# regulator (SOT-23-5 style body)
reg = cq.Workplane('XY').workplane(offset=t).center(0.8, 7.0).rect(2.9, 1.6).extrude(1.0)
part = board.union(ic).union(reg)
