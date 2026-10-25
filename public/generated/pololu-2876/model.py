pcb_t = 1.6
pcb = cq.Workplane('XY').box(15.24, pcb_t, 20.32, centered=(True, False, True))
zs = [-8.89, -6.35, -3.81, -1.27, 1.27, 3.81, 6.35, 8.89]
pts = [(x, z) for x in (-6.35, 6.35) for z in zs]
holes = cq.Workplane('XZ').pushPoints(pts).circle(0.5).extrude(5, both=True)
pcb = pcb.cut(holes)
cap = cq.Workplane('XY').box(3.0, 1.4, 2.5, centered=(True, False, True)).translate((-2.5, pcb_t, -8.0))
ic = cq.Workplane('XY').box(3.0, 0.8, 3.0, centered=(True, False, True)).translate((1.0, pcb_t, -1.0))
part = pcb.union(cap).union(ic)