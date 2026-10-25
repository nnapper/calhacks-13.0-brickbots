body = cq.Workplane('XY').workplane(offset=-52.5).center(0, 18.5).circle(18.5).extrude(105)
shaft = cq.Workplane('XY').workplane(offset=52.5).center(0, 18.5).circle(4).extrude(80)
part = body.union(shaft)