hole_x=-15.2
cy=7.75
# heat-shrink covered board (28.5 x 15.5 x 3.2)
body=cq.Workplane('XY').box(28.5,15.5,3.2).translate((6.0,cy,1.2))
# connecting web between board and ear
web=cq.Workplane('XY').box(7.0,10.1,3.2).translate((-11.75,cy,1.2))
# round mounting ear / standoff around the 4 mm hole
ear=cq.Workplane('XY').circle(5.05).extrude(5.6).translate((hole_x,cy,-2.8))
part=body.union(web).union(ear)
hole=cq.Workplane('XY').circle(2.0).extrude(8).translate((hole_x,cy,-4))
part=part.cut(hole)