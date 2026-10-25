N=48
rp=19.2
rb=rp*math.cos(math.radians(20))
ra=20.0
rr=18.2
T=6.0
h=math.pi/(2*N)
inv=lambda t:t-math.atan(t)
ip=inv(math.tan(math.radians(20)))
def f(r):
    return inv(math.sqrt((r/rb)**2-1))-ip
rs=[rr+(ra-rr)*i/5 for i in range(6)]
pts=[]
for i in range(N):
    a=2*math.pi*i/N
    for r in rs:
        th=a-h+f(r)
        pts.append((r*math.cos(th),r*math.sin(th)))
    for r in reversed(rs):
        th=a+h-f(r)
        pts.append((r*math.cos(th),r*math.sin(th)))
    th=a+math.pi/N
    pts.append((rr*math.cos(th),rr*math.sin(th)))
part=cq.Workplane('XZ').polyline(pts).close().extrude(-T)
part=part.cut(cq.Workplane('XZ').circle(7).extrude(-T))
R=11.4
for k in range(8):
    p=math.radians(k*45)
    s=cq.Workplane('XZ').center(R*math.cos(p),R*math.sin(p)).slot2D(4.7,4,k*45).extrude(-T)
    part=part.cut(s)
