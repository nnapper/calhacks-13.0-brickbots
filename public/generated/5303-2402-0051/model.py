body = cq.Workplane('XY').workplane(offset=-69).center(0, 18).circle(18).extrude(114.5)
shaft = cq.Workplane('XY').workplane(offset=45.5).center(0, 18).circle(4).extrude(23.5)
part = body.union(shaft)