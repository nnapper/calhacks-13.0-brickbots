t=1.0
board=cq.Workplane('XY').box(20.32,t,8.13,centered=(True,False,True))
holes=cq.Workplane('XZ').pushPoints([(9,-2.54),(9,0),(9,2.54)]).circle(0.5).extrude(-t)
slots=cq.Workplane('XZ').pushPoints([(-9.1,-1.6),(-9.1,1.6)]).slot2D(3,1.6,90).extrude(-t)
board=board.cut(holes).cut(slots)
def blk(x,z,l,w,h,y0=t):
    return cq.Workplane('XY').box(l,h,w,centered=(True,False,True)).translate((x,y0,z))
opto=blk(2.5,0,6.5,4.4,2.3)
m1=blk(-5.5,-1.8,3.3,3.3,1.0)
m2=blk(-2.0,1.8,3.3,3.3,1.0)
chip=blk(7.0,-1.8,2.5,2.5,0.9)
res=blk(3.5,-3.3,2.0,1.2,0.5)
part=board.union(opto).union(m1).union(m2).union(chip).union(res)