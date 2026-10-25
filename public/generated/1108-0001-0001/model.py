t = 2.5
cy = 36.0
plate = (cq.Workplane('XY').box(40, cy, t, centered=(True, False, True))
         .union(cq.Workplane('XY').center(0, cy).circle(20).extrude(t, both=True).intersect(
             cq.Workplane('XY').box(40, 40, t, centered=(True, False, True)).translate((0, cy, 0)))))
bore = cq.Workplane('XY').center(0, cy).circle(7).extrude(t, both=True)
ring_pts = [(12 * math.cos(math.radians(a)), cy + 12 * math.sin(math.radians(a))) for a in range(0, 360, 45)]
ring = cq.Workplane('XY').pushPoints(ring_pts).circle(2).extrude(t, both=True)
base_pts = [(x, 4) for x in (-16, -8, 0, 8, 16)]
base = cq.Workplane('XY').pushPoints(base_pts).circle(2).extrude(t, both=True)
part = plate.cut(bore).cut(ring).cut(base)