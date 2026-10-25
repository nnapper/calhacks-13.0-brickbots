pcb = cq.Workplane('XY').box(38.1, 1.6, 26.7, centered=(True, False, True))
hole = cq.Workplane('XZ').center(-14, 11.4).circle(1.15).extrude(-5)
pcb = pcb.cut(hole.translate((0, -1, 0)))
# 6-position screw terminal block along +X edge
term = cq.Workplane('XY').box(8, 8, 21, centered=(True, False, True)).translate((14.5, 1.6, 2))
# 10-pin header along -X edge
hdr = cq.Workplane('XY').box(2.54, 2.5, 25.4, centered=(True, False, True)).translate((-17.3, 1.6, 0)) if False else cq.Workplane('XY').box(2.54, 2.5, 22.86, centered=(True, False, True)).translate((-17.3, 1.6, 2))
pins = (cq.Workplane('XZ').pushPoints([(-17.3, 2 + (i - 4.5) * 2.54) for i in range(10)])
        .rect(0.64, 0.64).extrude(-8.5).translate((0, 1.6, 0)))
# electrolytic capacitor
cap = cq.Workplane('XZ').center(-5, 0).circle(3.15).extrude(-5.5).translate((0, 1.6, 0))
# micro-USB connector on back edge
usb = cq.Workplane('XY').box(8, 2.7, 5.5, centered=(True, False, True)).translate((-3, 1.6, -13.35 + 2.75 - 1.0))
part = pcb.union(term).union(hdr).union(pins).union(cap).union(usb)