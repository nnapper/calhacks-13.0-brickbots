pcb_t = 1.0
pcb = cq.Workplane('XY').box(10.2, pcb_t, 7.6, centered=(True, False, True))
# copper current pads on the -X side (thin layer on top)
pad_t = 0.07
pads = (cq.Workplane('XY').workplane(offset=0)
        .pushPoints([(-3.4, 2.3), (-3.4, -2.3)]).rect(3.0, 3.0).extrude(1))
pads = cq.Workplane('XY').box(3.0, pad_t, 3.0, centered=(True, False, True)).translate((-3.4, pcb_t, 2.3))
pads = pads.union(cq.Workplane('XY').box(3.0, pad_t, 3.0, centered=(True, False, True)).translate((-3.4, pcb_t, -2.3)))
body = pcb.union(pads)
# SOT-23 sensor body at center
sensor = cq.Workplane('XY').box(2.9, 1.1, 1.6, centered=(True, False, True)).translate((0.3, pcb_t + pad_t, 0))
body = body.union(sensor)
# through holes (axis along Y)
pin_pts = [(3.8, 2.54), (3.8, 0), (3.8, -2.54)]
pin_cut = cq.Workplane('XZ', origin=(0, -1, 0)).pushPoints(pin_pts).circle(0.5).extrude(-4)
term_pts = [(-3.8, 2.3), (-3.8, -2.3)]
term_cut = cq.Workplane('XZ', origin=(0, -1, 0)).pushPoints(term_pts).circle(0.9).extrude(-4)
part = body.cut(pin_cut).cut(term_cut)