d=12.0
t=4.0
body=cq.Workplane('XZ').circle(d/2).extrude(-t)
bore=cq.Workplane('XZ').circle(1.5).extrude(-t)
holes=cq.Workplane('XZ').pushPoints([(3.2,3.2),(-3.2,3.2),(3.2,-3.2),(-3.2,-3.2)]).circle(1.1).extrude(-t)
set_hole=cq.Workplane('XY').center(0,t/2).circle(1.15).extrude(d/2)
part=body.cut(bore).cut(holes).cut(set_hole)