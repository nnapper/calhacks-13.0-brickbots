t=1.0
board=cq.Workplane('XY').box(12.7,t,17.78,centered=(True,False,True))
mount=[(3.65,-6.35),(3.65,6.35)]
pins=[(-5.08,-7.62+2.54*i) for i in range(7)]
board=board.cut(cq.Workplane('XZ').pushPoints(mount).circle(1.09).extrude(-3))
board=board.cut(cq.Workplane('XZ').pushPoints(pins).circle(0.5).extrude(-3))
sensor=cq.Workplane('XY').workplane(offset=0).center(0,0).box(2.8,2.16-t,4.8,centered=(True,False,True)).translate((0.3,t,0))
part=board.union(sensor)