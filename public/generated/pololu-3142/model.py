W=25.4
L=30.48
T=1.6
board=cq.Workplane('XY').box(W,T,L,centered=(True,False,True))
holes=cq.Workplane('XZ').pushPoints([(10.2,12.7),(-10.2,-12.7),(10.2,-12.7)]).circle(1.1).extrude(-T)
part=board.cut(holes)