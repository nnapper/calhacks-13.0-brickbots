cy = 19.9
ring = cq.Workplane('XY').center(0, cy).circle(20).extrude(4, both=True)
pts = [(-16, cy-16), (16, cy-16), (-16, cy+16), (16, cy+16)]
ears = cq.Workplane('XY').pushPoints(pts).circle(4).extrude(4, both=True)
block = cq.Workplane('XY').box(14, 11.1, 8).translate((0, cy + 17.55, 0))
body = ring.union(ears).union(block)
bore = cq.Workplane('XY').center(0, cy).circle(16).extrude(10, both=True)
holes = cq.Workplane('XY').pushPoints(pts).circle(2).extrude(10, both=True)
slit = cq.Workplane('XY').box(2, 25, 12).translate((0, cy + 12.5, 0))
screw = cq.Workplane('YZ').center(cy + 18, 0).circle(1.5).extrude(10, both=True)
part = body.cut(bore).cut(holes).cut(slit).cut(screw)