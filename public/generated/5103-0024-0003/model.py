def cyl(d,h,y0,pts=[(0,0)]):
    return cq.Workplane('XZ',origin=(0,y0,0)).pushPoints(pts).circle(d/2).extrude(-h)

body=cyl(36,21.1,0)
housing=cq.Workplane('XZ',origin=(0,21.1,0)).rect(24,24).extrude(-11.6)
shaft=cyl(8,23.5,32.7).intersect(cq.Workplane('XY').box(7,200,10,centered=(True,True,True)))
part=body.union(housing).union(shaft)

front=[(-8,-8),(8,-8),(-8,8),(8,8)]
part=part.cut(cyl(4,10,32.7-10,front))
rear=[(8.84,8.84),(-8.84,8.84),(8.84,-8.84),(-8.84,-8.84)]
part=part.cut(cyl(3,6,0,rear))
part=part.cut(cyl(13,5,0))