t=6
part=cq.Workplane('XZ').circle(72).extrude(-t)
hubs=[(0,0),(-36,36),(36,36),(-36,-36),(36,-36)]
lobes=[]
for cx,cz in hubs:
    for k in range(4):
        a=math.radians(45+90*k)
        lobes.append((cx+10*math.cos(a),cz+10*math.sin(a)))
bores=cq.Workplane('XZ').pushPoints(hubs).circle(7).extrude(-t)
thru=cq.Workplane('XZ').pushPoints(lobes).circle(2.1).extrude(-t)
cb=cq.Workplane('XZ').workplane(offset=-3).pushPoints(lobes).circle(4).extrude(-3)
part=part.cut(bores).cut(thru).cut(cb)