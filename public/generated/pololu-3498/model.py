d=9.7
t=2.0
bore=2.0
part=(cq.Workplane('XZ').circle(d/2).extrude(-t).faces('>Y').workplane().hole(bore))