W=20.32; L=22.86; T=1.6
pcb=cq.Workplane('XZ').rect(W,L).extrude(-T)
pcb=pcb.cut(cq.Workplane('XZ').center(8.1,-8.8).circle(1.09).extrude(-T))
part=pcb
# 9-pin header along the long edge
hx=-8.9
for i in range(9):
    z=(i-4)*2.54
    hs=cq.Workplane('XY').box(2.54,2.5,2.54,centered=(True,False,True)).translate((hx,T,z))
    pin=cq.Workplane('XY').box(0.64,11-T,0.64,centered=(True,False,True)).translate((hx,T,z))
    part=part.union(hs).union(pin)
# 4-position screw terminal block on one short edge
tb=cq.Workplane('XY').box(14,8.5,7.6,centered=(True,False,True)).translate((2,T,7.4))
for i in range(4):
    x=2+(i-1.5)*3.5
    tb=tb.cut(cq.Workplane('XZ').center(x,7.4).circle(1.2).extrude(-0.5).translate((0,T+8.0,0)))
part=part.union(tb)
# electrolytic can capacitor
cap=cq.Workplane('XZ').center(4,0.5).circle(3.15).extrude(-5.5).translate((0,T,0))
part=part.union(cap)