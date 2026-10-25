part = cq.Workplane('XZ').circle(24).extrude(-6)
recess = cq.Workplane('XZ').workplane(offset=-3).circle(19).extrude(-3)
part = part.cut(recess)
bore = cq.Workplane('XZ').circle(7).extrude(-6)
part = part.cut(bore)
pts = [(12,0),(-12,0),(0,12),(0,-12),(8,8.7),(-8,8.7),(8,-8.7),(-8,-8.7)]
holes = cq.Workplane('XZ').pushPoints(pts).circle(2).extrude(-6)
part = part.cut(holes)