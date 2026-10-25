W,H,T=68.6,53.3,1.6
yc=H/2
z0=-3.0
zt=z0+T
pcb=cq.Workplane('XY').workplane(offset=z0).center(0,yc).rect(W,H).extrude(T)
pcb=pcb.cut(cq.Workplane('XY').workplane(offset=z0-1).pushPoints([(-24,yc-18),(24,yc+18)]).circle(1.6).extrude(T+2))
part=pcb
hdr_len=25.4
hx=-12
for dy in (-24.1,24.1):
    body=cq.Workplane('XY').workplane(offset=zt).center(hx,yc+dy).rect(hdr_len,2.54).extrude(9.5-zt)
    part=part.union(body)
    pts=[(hx+(i-4.5)*2.54,yc+dy) for i in range(10)]
    pins=cq.Workplane('XY').workplane(offset=-9.5).pushPoints(pts).rect(0.64,0.64).extrude(z0+9.5)
    part=part.union(pins)
for i in range(4):
    tb=cq.Workplane('XY').workplane(offset=zt).center(27,yc+(i-1.5)*5.0).rect(8,5).extrude(10)
    part=part.union(tb)
for cx,cy in ((-14,yc+4),(-8,yc-4)):
    cap=cq.Workplane('XY').workplane(offset=zt).center(cx,cy).circle(3.15).extrude(7)
    part=part.union(cap)
