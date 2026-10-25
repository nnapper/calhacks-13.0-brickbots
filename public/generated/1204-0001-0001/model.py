pts=[(-7.5,-7.5),(7.5,-7.5),(7.5,-4.3),(-4.3,7.5),(-7.5,7.5)]
body=cq.Workplane('XZ').polyline(pts).close().extrude(-14)
def cyl(r,h,p,d):
    return cq.Workplane('XY').add(cq.Solid.makeCylinder(r,h,cq.Vector(*p),cq.Vector(*d)))
part=body
for c in [cyl(2,20,(0.5,7,-8),(0,0,1)),cyl(4,10,(0.5,7,-3),(0,0,1)),cyl(2,20,(-8,7,0.5),(1,0,0)),cyl(4,10,(-3,7,0.5),(1,0,0))]:
    part=part.cut(c)