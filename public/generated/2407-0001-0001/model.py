r=36
t=16
body=cq.Workplane('XY').circle(r).extrude(t/2,both=True)
# recessed web on +Z face, leaving outer rim and central hub
pocket=cq.Workplane('XY').workplane(offset=t/2).circle(33).circle(18).extrude(-8)
body=body.cut(pocket)
# central bore
body=body.cut(cq.Workplane('XY').workplane(offset=-t/2).circle(4).extrude(t))
# ring of 8 bolt holes on 56 mm bolt circle
pts=[(28*math.cos(math.radians(a*45)),28*math.sin(math.radians(a*45))) for a in range(8)]
holes=cq.Workplane('XY').workplane(offset=-t/2).pushPoints(pts).circle(2).extrude(t)
body=body.cut(holes)
part=body.translate((0,r,0))