def bx(x0,x1,y0,y1,z0,z1):
    return cq.Workplane('XY').box(x1-x0,y1-y0,z1-z0,centered=False).translate((x0,y0,z0))

body = bx(-11,11,0,13.2,-7.1,7.1)
tab_l = bx(-13.5,-10,8.5,13.2,-7.1,-3.1)
tab_r = bx(10,13.5,2.0,6.9,-7.1,-3.1)
part = body.union(tab_l).union(tab_r)

# emitter and detector window pockets on the front face (+Z)
for cx in (-4.5, 3.5):
    pocket = bx(cx-3, cx+3, 3.6, 9.6, 5.1, 7.1)
    part = part.cut(pocket)

# mounting holes through the tabs (axis Z)
for (hx, hy) in ((-11.8, 11.0), (11.6, 4.4)):
    h = cq.Workplane('XY').center(hx, hy).circle(1.1).extrude(10, both=True)
    part = part.cut(h)
