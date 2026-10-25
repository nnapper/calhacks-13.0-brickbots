pcb = cq.Workplane('XY').box(22.1, 19.9, 1.6).translate((0, 9.95, -7.4))
pcb = pcb.cut(cq.Workplane('XY').workplane(offset=-9).center(-7.9, 15.5).circle(1.55).extrude(4))
trans = cq.Workplane('XY').workplane(offset=-6.6).center(1.5, 8.5).circle(8.0).extrude(14.8)
part = pcb.union(trans)