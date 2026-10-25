body = cq.Workplane('XY').workplane(offset=-2).center(0, 4).slot2D(16, 8).extrude(4)
holes = cq.Workplane('XY').workplane(offset=-2).pushPoints([(-4, 4), (4, 4)]).circle(2).extrude(4)
part = body.cut(holes)