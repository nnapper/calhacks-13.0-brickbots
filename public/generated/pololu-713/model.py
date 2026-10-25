pcb = cq.Workplane('XY').box(15.24, 20.32, 1.6).translate((0, 10.16, -0.7))
ys = [8.89, 6.35, 3.81, 1.27, -1.27, -3.81, -6.35, -8.89]
pts = [(x, y) for x in (-6.35, 6.35) for y in ys]
pcb = pcb.faces('>Z').workplane(centerOption='CenterOfBoundBox').pushPoints(pts).hole(1.0)
ic = cq.Workplane('XY').box(6.4, 7.8, 1.4).translate((0, 10.16, 0.8))
part = pcb.union(ic)