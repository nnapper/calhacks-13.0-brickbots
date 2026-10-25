m=0.8
N=24
ro=10.4
rr=ro-2.25*m
pts=[]
for i in range(N):
    a=i*360.0/N
    for da,r in((-6.5,rr),(-3.5,ro),(3.5,ro),(6.5,rr)):
        t=math.radians(a+da)
        pts.append((r*math.cos(t),r*math.sin(t)))
body=cq.Workplane('XY').polyline(pts).close().extrude(3,both=True)
body=body.cut(cq.Workplane('XY').circle(1.5).extrude(3,both=True))
part=body.translate((0,10.4,0))