def cyl(x,y,d,h,b=0):
    w=cq.Workplane('XY').center(x,y).circle(d/2)
    if b: w=w.circle(b/2)
    return w.extrude(h/2,both=True)

part=cyl(88,37,74,20,8).union(cyl(14,37,74,20,8))
for i in range(8):
    L=72-6*i
    cx=-105+30*i
    cy=150-L/2
    outer=cq.Workplane('XY').center(cx,cy).slot2D(L,22,90).extrude(7.5,both=True)
    inner=cq.Workplane('XY').center(cx,cy).slot2D(L-6,16,90).extrude(10,both=True)
    part=part.union(outer.cut(inner))
    part=part.union(cyl(-114+12*i,6,6,30))
for r in range(2):
    for c in range(4):
        part=part.union(cyl(-110+24*c,55-30*r,20,15,8))
