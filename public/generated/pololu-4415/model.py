L=61.0
W=20.0
T=1.6
H=3.0
board=cq.Workplane('XY').box(L,T,W,centered=(True,False,True))
# 15 sensor bodies at 4 mm pitch near the +Z long edge
pts=[(-28+4*i,5.5) for i in range(15)]
sensors=(cq.Workplane('XZ').workplane(offset=-T).pushPoints(pts).rect(2.6,2.0).extrude(-(H-T)))
part=board.union(sensors)
# mounting holes and small holes (through board, along Y)
big=cq.Workplane('XZ').pushPoints([(-28.7,8),(28.6,8)]).circle(1.1).extrude(-5)
small=cq.Workplane('XZ').pushPoints([(-19.7,8.6),(-1.2,7.7)]).circle(0.6).extrude(-5)
part=part.cut(big).cut(small)