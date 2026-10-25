R=24.0
W=19.0
cy=24.0
hub=cq.Workplane('XY').circle(17).extrude(W).translate((0,0,-W/2))
n=10
rl=9.0
rr=4.4
rc=19.6
body=hub
for row,zc in enumerate((-5.0,5.0)):
    for i in range(n):
        a=2*math.pi*(i+0.5*row)/n
        px=rc*math.cos(a); py=rc*math.sin(a)
        tx=-math.sin(a); ty=math.cos(a)
        start=cq.Vector(px-tx*rl/2,py-ty*rl/2,zc)
        roller=cq.Solid.makeCylinder(rr,rl,start,cq.Vector(tx,ty,0))
        body=body.union(cq.Workplane('XY').add(roller))
clip=cq.Workplane('XY').circle(R).extrude(W).translate((0,0,-W/2))
body=body.intersect(clip)
bore=cq.Workplane('XY').polygon(6,8/math.cos(math.pi/6)).extrude(W).translate((0,0,-W/2))
body=body.cut(bore)
for s in (1,-1):
    z0=W/2-2.0 if s>0 else -W/2
    rec=cq.Workplane('XY').workplane(offset=z0).circle(7).extrude(2.0)
    body=body.cut(rec)
holes=cq.Workplane('XY').workplane(offset=-W/2).pushPoints([(-8,-8),(8,-8),(-8,8),(8,8)]).circle(1.75).extrude(W)
body=body.cut(holes)
part=body.translate((0,cy,0))