t=0.8
pcb=cq.Workplane('XY').box(7.5,t,20,centered=(True,False,True))
mount=cq.Workplane('XZ').center(0,7.5).circle(1.1).extrude(-t)
pins=cq.Workplane('XZ').pushPoints([(-2.54,-8.9),(0,-8.9),(2.54,-8.9),(-2.54,-6.36)]).circle(0.5).extrude(-t)
pcb=pcb.cut(mount).cut(pins)
sensor=cq.Workplane('XY').box(3.6,1.7,3.2,centered=(True,False,True)).translate((0,t,3.0))
part=pcb.union(sensor)