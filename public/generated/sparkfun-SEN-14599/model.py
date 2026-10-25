L=53.5; W=33.5; H=24.5; t=3.5
plate=cq.Workplane('XY').box(L,t,W,centered=(True,False,True))
body=cq.Workplane('XY').box(40,H,24,centered=(True,False,True))
part=plate.union(body)
lens=cq.Workplane('XZ',origin=(0,H,0)).pushPoints([(-10,0),(10,0)]).circle(6.25).extrude(1.5)
part=part.cut(lens)
holes=cq.Workplane('XZ',origin=(0,t,0)).pushPoints([(-23.5,-12.5),(-23.5,12.5),(23.5,-12.5),(23.5,12.5)]).circle(1.6).extrude(t)
part=part.cut(holes)