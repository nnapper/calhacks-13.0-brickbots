t=1.0
part=cq.Workplane('XY').box(20.32,t,12.7,centered=(True,False,True))
part=part.cut(cq.Workplane('XZ').center(-8.06,4.25).circle(1.09).extrude(-3*t))
comps=[(-2.0,0.5,3.0,0.9,3.0),(-5.5,-3.5,2.0,0.9,2.0),(-1.5,-4.0,3.0,1.0,1.4),(3.0,-1.0,3.0,1.0,1.4),(6.0,2.0,2.8,1.1,1.4),(-6.0,0.0,1.6,0.8,0.8),(2.0,3.5,1.6,0.8,0.8),(0.5,-2.0,1.6,0.8,0.8)]
for x,z,l,h,w in comps:
    part=part.union(cq.Workplane('XY').box(l,h,w,centered=(True,False,True)).translate((x,t,z)))