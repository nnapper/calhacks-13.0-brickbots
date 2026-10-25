pcb = cq.Workplane('XY').box(30, 1.6, 30, centered=(True, False, True))
ant = cq.Workplane('XY').workplane(offset=1.6).box(25, 7.4, 25, centered=(True, False, True))
body = pcb.union(ant)
pts = [(-13.5, -13.5), (13.5, -13.5), (-13.5, 13.5), (13.5, 13.5)]
holes = cq.Workplane('XZ', origin=(0, 2, 0)).pushPoints(pts).circle(1.1).extrude(3)
part = body.cut(holes)