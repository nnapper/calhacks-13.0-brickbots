L=33.02
W=17.78
T=1.6
xs=[-15.24+2.54*i for i in range(13)]
pts=[(x,z) for x in xs for z in (-7.62,7.62)]
board=cq.Workplane('XY').box(L,T,W,centered=(True,False,True))
holes=cq.Workplane('XZ').pushPoints(pts).circle(0.5).extrude(-T)
part=board.cut(holes)