def bx(x,y,z,cx,y0,cz):
    return cq.Workplane('XY').box(x,y,z,centered=(True,False,True)).translate((cx,y0,cz))

part = bx(48,2,48,0,0,0)  # backing layer
part = part.union(bx(48,1.6,48,0,2,0))  # PCB
# tactile buttons (body + cap)
for bxp,bzp in [(-12,8),(0,8),(12,8),(6,18)]:
    part = part.union(bx(6,3.5,6,bxp,3.6,bzp))
    part = part.union(cq.Workplane('XY').circle(1.8).extrude(1.2).translate((bxp,7.1,bzp)))
# main IC
part = part.union(bx(10,1.8,5,-10,3.6,-4))
# two 3-pin headers with vertical pins
for hx in (-6,6):
    part = part.union(bx(7.62,2.5,2.54,hx,3.6,-18))
    for i in (-1,0,1):
        part = part.union(bx(0.64,14-3.6-2.5+2.5,0.64,hx+i*2.54,3.6,-18).intersect(bx(2,14-3.6,2,hx+i*2.54,3.6,-18)))
