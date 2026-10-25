R=29.0
W=16.0
tire=cq.Workplane('XZ').circle(R).extrude(-W).edges().fillet(5)
recess=cq.Workplane('XZ').workplane(offset=-W).circle(21).extrude(3)
part=tire.cut(recess)