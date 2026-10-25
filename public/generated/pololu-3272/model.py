w=25
d=70
bore=22
part=(cq.Workplane('XY').circle(d/2).extrude(w).translate((0,0,-w/2))
 .edges().fillet(8)
 .cut(cq.Workplane('XY').circle(bore/2).extrude(w).translate((0,0,-w/2)))
 .translate((0,d/2,0)))