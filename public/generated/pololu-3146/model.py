pcb_t = 1.6
L = 35.56
W = 30.48
pcb = cq.Workplane('XY').box(L, pcb_t, W, centered=(True, False, True))
hole_pts = [(-2.7, 12.7), (-15.4, -13.2), (14.9, -13.2)]
holes = cq.Workplane('XZ').pushPoints(hole_pts).circle(1.1).extrude(-pcb_t)
pcb = pcb.cut(holes)
caps = (cq.Workplane('XZ', origin=(0, pcb_t, 0))
        .pushPoints([(5.0, 6.0), (9.0, 0.0)])
        .circle(5.0).extrude(-(8.0 - pcb_t)))
usb = (cq.Workplane('XY')
       .box(8.0, 2.8, 5.6, centered=(True, False, False))
       .translate((-10.0, pcb_t, W / 2 - 5.6 + 0.8)))
part = pcb.union(caps).union(usb)