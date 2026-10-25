R=16.0
h=10.0
t=3.0
cyl=cq.Workplane('XZ').circle(R).extrude(-h)
base=cq.Workplane('XZ').circle(R).extrude(-t)
part=base
for k in range(4):
    a=k*90
    pts=[(0,0)]+[(40*math.cos(math.radians(a+d)),40*math.sin(math.radians(a+d))) for d in (-40,40)]
    lobe=cq.Workplane('XZ').polyline(pts).close().extrude(-h).intersect(cyl)
    part=part.union(lobe)
boss=cq.Workplane('XZ').circle(7.0).extrude(-h)
part=part.union(boss)
round_pts=[(11.3,0),(-11.3,0),(0,11.3),(0,-11.3)]
slot_pts=[(8.5,8.5),(-8.5,8.5),(8.5,-8.5),(-8.5,-8.5)]
part=part.cut(cq.Workplane('XZ').pushPoints(round_pts).circle(1.7).extrude(-h))
part=part.cut(cq.Workplane('XZ').pushPoints(slot_pts).circle(2.1).extrude(-h))
part=part.cut(cq.Workplane('XZ').circle(2.95).extrude(-h))