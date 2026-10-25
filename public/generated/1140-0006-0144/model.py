part = cq.Workplane('XZ').circle(72).extrude(-6)
center_hole = cq.Workplane('XZ').circle(7).extrude(-6)
part = part.cut(center_hole)