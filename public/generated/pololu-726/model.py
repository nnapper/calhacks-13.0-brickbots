pcb_t = 1.6
z0 = -8.2
pcb = cq.Workplane('XY').box(22.1, 19.9, pcb_t, centered=(True, False, False)).translate((0, 0, z0))
cyl = (cq.Workplane('XY').workplane(offset=z0 + pcb_t).center(1.5, 8.5).circle(8.0).extrude(16.4 - pcb_t))
part = pcb.union(cyl)
mount = cq.Workplane('XY').workplane(offset=z0 - 1).center(-7.5, 14.5).circle(1.55).extrude(pcb_t + 2)
part = part.cut(mount)
pins = (cq.Workplane('XY').workplane(offset=z0 - 1)
        .pushPoints([(-8.9 + i * 2.54, 18.2) for i in range(7)])
        .circle(0.5).extrude(pcb_t + 2))
part = part.cut(pins)