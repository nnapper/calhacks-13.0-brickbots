L=35.56
W=17.78
T=1.0
pcb=cq.Workplane('XY').box(L,T,W,centered=(True,False,True))
pts=[(-16.51+2.54*i,s*7.62) for i in range(14) for s in (-1,1)]
holes=cq.Workplane('XZ').workplane(offset=-2).pushPoints(pts).circle(0.5).extrude(4)
pcb=pcb.cut(holes)
usb=cq.Workplane('XY').box(5.6,2.5,7.5,centered=(True,False,True)).translate((14.98,T,0))
chip=cq.Workplane('XY').box(7,1.0,7,centered=(True,False,True)).translate((1,T,0))
part=pcb.union(usb).union(chip)