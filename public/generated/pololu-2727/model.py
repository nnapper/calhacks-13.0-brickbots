t=0.254
cz=10-3.81
body=(cq.Workplane('XZ').center(0,cz).circle(3.81).extrude(-t))
tail=(cq.Workplane('XZ').center(0,(cz-5)/2).rect(6.0,cz+5).extrude(-t))
pins=(cq.Workplane('XZ').pushPoints([(-1.27,-6.5),(1.27,-6.5)]).rect(0.8,7).extrude(-t))
part=body.union(tail).union(pins)