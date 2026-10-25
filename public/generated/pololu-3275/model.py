r=42.0
w=24.0
body=cq.Workplane('XY').workplane(offset=-w/2).circle(r).extrude(w).edges().fillet(8.0)
bore=cq.Workplane('XY').workplane(offset=-w/2).circle(11.0).extrude(w)
part=body.cut(bore).translate((0,r,0))