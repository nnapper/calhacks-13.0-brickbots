N=20
m=0.8
rp=m*N/2
rr=rp-1.25*m
ro=rp+m
p=2*math.pi/N
pts=[]
for i in range(N):
    a=i*p
    for r,d in ((rr,-0.30),(ro,-0.17),(ro,0.17),(rr,0.30)):
        t=a+d*p
        pts.append((r*math.cos(t),r*math.sin(t)))
teeth=cq.Workplane('XY').polyline(pts).close().extrude(8)
hub=cq.Workplane('XY').workplane(offset=8).circle(7).extrude(8)
body=teeth.union(hub)
bore=cq.Workplane('XY').polygon(6,8/math.cos(math.pi/6)).extrude(16)
body=body.cut(bore)
screw=cq.Workplane('YZ').workplane(offset=0).center(0,12).circle(1.5).extrude(8)
body=body.cut(screw)
part=body.rotate((0,0,0),(1,0,0),-90)