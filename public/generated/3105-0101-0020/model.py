body = cq.Workplane('XZ').rect(48, 48).extrude(-14)
holes = (cq.Workplane('XZ').pushPoints([(-20, -20), (20, -20), (-20, 20), (20, 20)])
         .circle(2.1).extrude(-14))
part = body.cut(holes)