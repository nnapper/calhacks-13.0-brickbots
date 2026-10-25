body = cq.Workplane('XY').workplane(offset=-22.25).center(0, 5.25).circle(5.25).extrude(43.5)
button = cq.Workplane('XY').workplane(offset=21.25).center(0, 5.25).circle(2.0).extrude(1.0)
part = body.union(button)