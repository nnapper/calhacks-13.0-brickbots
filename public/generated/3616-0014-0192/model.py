R=96.0
W=72.0
ri=70.0
tire=cq.Workplane('XY').circle(R).circle(ri).extrude(W/2,both=True)
hub=cq.Workplane('XY').circle(ri+1).extrude(4,both=True)
body=tire.union(hub)
pk=None
for side in (1,-1):
    for i in range(24):
        a=i*15.0
        b=(cq.Workplane('XY').box(14,16,20).translate((81,0,side*(W/2-10))).rotate((0,0,0),(0,0,1),a))
        pk=b if pk is None else pk.union(b)
body=body.cut(pk)
body=body.cut(cq.Workplane('XY').circle(7).extrude(W,both=True))
pts=[(8,8),(8,-8),(-8,8),(-8,-8),(16,16),(16,-16),(-16,16),(-16,-16)]
body=body.cut(cq.Workplane('XY').pushPoints(pts).circle(2).extrude(W,both=True))
part=body.translate((0,R,0))