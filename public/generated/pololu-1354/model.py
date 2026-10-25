W=27.94
L=45.72
T=1.6
pcb=cq.Workplane('XZ').rect(W,L).extrude(-T)
pcb=pcb.faces('>Y').workplane(centerOption='CenterOfBoundBox').pushPoints([(-5,-20.4),(9,20.4)]).hole(2.2)
usb=cq.Workplane('XY').box(7.7,2.7,8,centered=(True,False,True)).translate((0,T,-L/2+4-1.5))
term=cq.Workplane('XY').box(10,7.5,7.6,centered=(True,False,True)).translate((0,T,L/2-3.8-1))
part=pcb.union(usb).union(term)