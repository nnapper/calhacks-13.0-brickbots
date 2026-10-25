pts=[(x,z) for x in (-3.81,3.81) for z in (-7.62,-5.08,-2.54,0,2.54,5.08,7.62)]
board=cq.Workplane('XY').box(10.16,0.8,17.78,centered=(True,False,True))
board=board.cut(cq.Workplane('XZ').pushPoints(pts).circle(0.5).extrude(1,both=True))
ic=cq.Workplane('XY').box(3.9,1.2,4.9,centered=(True,False,True)).translate((0.3,0.8,0.5))
cap=cq.Workplane('XY').box(3.0,1.8,3.4,centered=(True,False,True)).translate((-2.3,0.8,-5.6))
part=board.union(ic).union(cap)