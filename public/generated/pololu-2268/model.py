body = cq.Workplane('XY').box(42.3, 38, 42.3, centered=(True, False, True)).edges('|Y').chamfer(3)
pts = [(15.5, 15.5), (-15.5, 15.5), (15.5, -15.5), (-15.5, -15.5)]
holes = cq.Workplane('XZ', origin=(0, 33.5, 0)).pushPoints(pts).circle(1.5).extrude(-5)
body = body.cut(holes)
boss = cq.Workplane('XZ', origin=(0, 38, 0)).circle(11).extrude(-2)
screw = cq.Workplane('XZ', origin=(0, 40, 0)).circle(4).extrude(-242)
flange = cq.Workplane('XZ', origin=(0, 80, 0)).circle(11).extrude(-4)
hub = cq.Workplane('XZ', origin=(0, 84, 0)).circle(6).extrude(-8)
part = body.union(boss).union(screw).union(flange).union(hub)