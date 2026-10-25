t=0.9144
L,W=98.0,48.0
def bx(cx,cz,sx,sz):
    return cq.Workplane('XY').box(sx,t+2,sz,centered=(True,False,True)).translate((cx,-1,cz))
part=cq.Workplane('XY').box(L,t,W,centered=(True,False,True))
# stepped recesses along the z=-24 edge at both ends
part=part.cut(bx(-31.5,-20.5,35,7)).cut(bx(38.5,-20.5,21,7))
# U-shaped slots forming the two bendable tabs, each with a hole
for xc in (-24,27):
    ring=bx(xc,-11.5,12,11).cut(bx(xc,-12,10,10))
    part=part.cut(ring)
    part=part.cut(cq.Workplane('XZ').center(xc,11).circle(1.15).extrude(-(t+2)).translate((0,-1,0)))
