def ext(w,h):
    return w.extrude(h/2,both=True)

parts=[]
# 4 pulleys (OD 32, 16 thick) with 8mm hex REX bore
for x in (-57,-19,19,57):
    p=ext(cq.Workplane('XY').center(x,16).circle(16),16)
    b=ext(cq.Workplane('XY').center(x,16).polygon(6,8/math.cos(math.pi/6)),16)
    parts.append(p.cut(b))
# coiled belt as a flat ring (6mm wide)
coil=ext(cq.Workplane('XY').center(40,115).circle(35),6).cut(ext(cq.Workplane('XY').center(40,115).circle(15),6))
parts.append(coil)
# 3 closed belt loops as flat stadium rings
for y in (90,115,140):
    o=ext(cq.Workplane('XY').center(-35,y).slot2D(80,14),6)
    i=ext(cq.Workplane('XY').center(-35,y).slot2D(77,11),6)
    parts.append(o.cut(i))
part=parts[0]
for s in parts[1:]:
    part=part.union(s)