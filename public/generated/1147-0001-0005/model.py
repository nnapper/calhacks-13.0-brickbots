t=2.0
h=cq.Workplane('XY').box(40,t,16,centered=(True,False,True))
v=cq.Workplane('XY').box(40,16,t,centered=(True,False,False)).translate((0,0,-8))
part=h.union(v)
for x in (-16,-8,0,8,16):
    cy=cq.Solid.makeCylinder(2,10,cq.Vector(x,-1,0),cq.Vector(0,1,0))
    cz=cq.Solid.makeCylinder(2,10,cq.Vector(x,8,-9),cq.Vector(0,0,1))
    part=part.cut(cq.Workplane('XY').add(cy)).cut(cq.Workplane('XY').add(cz))