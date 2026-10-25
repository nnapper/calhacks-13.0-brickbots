body = cq.Workplane('XY').workplane(offset=-12).center(0, 50).circle(50).extrude(24).edges().fillet(8)
bore = cq.Workplane('XY').workplane(offset=-12).center(0, 50).circle(11).extrude(24)
part = body.cut(bore)