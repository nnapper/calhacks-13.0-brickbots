L=35.56
W=25.4
T=1.6
board=cq.Workplane('XY').box(L,T,W,centered=(True,False,True))
for x in (-15.5,15.5):
    h=cq.Solid.makeCylinder(1.1,T+2,cq.Vector(x,-1,10.3),cq.Vector(0,1,0))
    board=board.cut(cq.Workplane('XY').add(h))
ic=cq.Workplane('XY').box(7,1.0,7,centered=(True,False,True)).translate((3,T,-1))
caps=None
for z in (-1.0,5.5):
    c=cq.Workplane('XY').add(cq.Solid.makeCylinder(3.15,7.7,cq.Vector(-8,T,z),cq.Vector(0,1,0)))
    caps=c if caps is None else caps.union(c)
part=board.union(ic).union(caps)