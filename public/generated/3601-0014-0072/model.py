ring = cq.Workplane('XY').workplane(offset=-16).circle(36).circle(28).extrude(32)
web = cq.Workplane('XY').workplane(offset=-8).circle(28).extrude(8)
pts = [(x, y) for x in (-16, -8, 8, 16) for y in (-16, -8, 8, 16)] + [(0, 24), (0, -24), (24, 0), (-24, 0)]
holes = cq.Workplane('XY').workplane(offset=-8).pushPoints(pts).circle(2).extrude(8)
bore = cq.Workplane('XY').workplane(offset=-8).circle(7).extrude(8)
part = ring.union(web).cut(holes).cut(bore).translate((0, 36, 0))