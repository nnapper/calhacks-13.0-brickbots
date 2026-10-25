pcb_t = 0.8
pcb = cq.Workplane('XY').box(7.5, pcb_t, 20, centered=(True, False, True))
# mounting hole near +Z end (local x=X, local y=Z on XZ workplane)
mount = cq.Workplane('XZ').center(0, 7.4).circle(1.6).extrude(5, both=True)
pins = cq.Workplane('XZ').pushPoints([(-2.54, -8.7), (0, -8.7), (2.54, -8.7)]).circle(0.5).extrude(5, both=True)
pcb = pcb.cut(mount).cut(pins)
# reflective sensor body on top, bringing total height to 3.0 mm
sensor = cq.Workplane('XY').box(5.5, 3.0 - pcb_t, 3.5, centered=(True, False, True)).translate((0, pcb_t, 1.5))
part = pcb.union(sensor)