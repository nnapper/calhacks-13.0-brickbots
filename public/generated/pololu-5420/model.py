bt=0.8
board=cq.Workplane('XY').box(20.32,bt,8.128,centered=(True,False,True))
# through holes on input edge (Y-axis)
holes=cq.Workplane('XZ').pushPoints([(8.9,2.54),(8.9,0),(8.9,-2.54)]).circle(0.5).extrude(2,both=True)
slots=cq.Workplane('XZ').pushPoints([(-8.3,2.3),(-8.3,-2.3)]).slot2D(2.8,1.5,0).extrude(2,both=True)
board=board.cut(holes).cut(slots)
def blk(x,z,lx,lz,h):
    return cq.Workplane('XY').box(lx,h,lz,centered=(True,False,True)).translate((x,bt,z))
opto=blk(1.5,0,4.0,4.4,3.302-bt)
m1=blk(-3.5,2.1,3.3,3.0,1.0)
m2=blk(-3.5,-2.1,3.3,3.0,1.0)
ic=blk(6.0,-2.0,2.0,2.4,0.8)
part=board.union(opto).union(m1).union(m2).union(ic)