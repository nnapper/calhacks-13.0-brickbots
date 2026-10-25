r=21.0
t=6.5
cy=21.0
part=cq.Workplane('YZ').center(cy,0).circle(r).extrude(t/2,both=True)
part=part.cut(cq.Workplane('YZ').center(cy,0).circle(8).extrude(t,both=True))
n=28
for i in range(n):
    slot=cq.Workplane('XY').box(t+2,5,1.6).translate((0,cy+19.5,0)).rotate((0,cy,0),(1,cy,0),i*360.0/n)
    part=part.cut(slot)
