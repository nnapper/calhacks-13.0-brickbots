m=0.8
N=12
rp=m*N/2
rb=rp*math.cos(math.radians(20))
rt=rp+m
rr=rp-1.25*m
def inv(a):
    return math.tan(a)-a
def phi(r):
    return math.pi/(2*N)+inv(math.radians(20))-inv(math.acos(min(1,rb/r)))
rs=[rb+(rt-rb)*i/8 for i in range(9)]
pts=[]
for k in range(N):
    c=2*math.pi*k/N
    seq=[(rr,-phi(rb))]+[(r,-phi(r)) for r in rs]+[(r,phi(r)) for r in reversed(rs)]+[(rr,phi(rb))]
    for r,a in seq:
        pts.append((r*math.cos(c+a),r*math.sin(c+a)))
gear=cq.Workplane('XY').polyline(pts).close().extrude(4,both=True)
bore=cq.Workplane('XY').circle(2.9).extrude(4,both=True)
part=gear.cut(bore).translate((0,rt,0))