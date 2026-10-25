bw=8.0
bar_t=3.0
pitch=16.0
blocks=[cq.Workplane('XY').box(bw,bw,bw,centered=(True,False,True)).translate((sx*pitch,0,0)) for sx in (-1,1)]
bar=cq.Workplane('XY').box(2*pitch,bar_t,bw,centered=(True,False,True))
part=bar
for b in blocks:
    part=part.union(b)
def cyl(d,h,p,v):
    return cq.Workplane('XY').add(cq.Solid.makeCylinder(d/2,h,cq.Vector(*p),cq.Vector(*v)))
for x in (-8,0,8):
    part=part.cut(cyl(5.0,bar_t+2,(x,-1,0),(0,1,0)))
for sx in (-1,1):
    cx=sx*pitch
    part=part.cut(cyl(4.0,6,(cx,bw-6,0),(0,1,0)))
    part=part.cut(cyl(4.0,6,(cx,bw/2,bw/2-6),(0,0,1)))
    part=part.cut(cyl(4.0,6,(cx+sx*(bw/2-6),bw/2,0),(sx,0,0)))