body_h=10.2
by=4.0
body=cq.Workplane('XY').box(20,body_h,6.4).translate((0,by+body_h/2,0))
holes=cq.Workplane('XY').pushPoints([(-4.75,6.5),(4.75,6.5)]).circle(1.2).extrude(5,both=True)
body=body.cut(holes)
part=body
for x in (-8.1,0.7,8.0):
    pin=cq.Workplane('XY').box(3.2,4.5,0.5).translate((x,2.25,0))
    ph=cq.Workplane('XY').center(x,1.8).circle(0.8).extrude(2,both=True)
    part=part.union(pin.cut(ph))
post=cq.Workplane('XY').box(2.5,1.2,3.2).translate((6.5,14.8,0))
lever=(cq.Workplane('XY').box(16.7,0.4,3.2).translate((-8.35,0,0))
       .rotate((0,0,0),(0,0,1),-10).translate((7,14.8,0)))
part=part.union(post).union(lever)