pts=[(-24+8*i,7) for i in range(7)]
plate=cq.Workplane('XY').box(56,14,2.5,centered=(True,False,True))
cutter=cq.Workplane('XY').workplane(offset=-2).pushPoints(pts).circle(2).extrude(4)
part=plate.cut(cutter)