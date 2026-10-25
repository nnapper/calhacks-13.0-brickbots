L, H, W = 57.0, 30.0, 32.0
r = 7.0
zc = 8.0
yb, yt = 7.6, 22.4
body = cq.Workplane('XY').box(L, H, W, centered=(True, False, True))
cut = None
for y in (yb, yt):
    for z in (-zc, zc):
        cyl = cq.Workplane('YZ').center(y, z).circle(r).extrude(27.0, both=True)
        if y > H / 2:
            slot = cq.Workplane('XY').box(54.0, 8.0, 12.0).translate((0, y + 4.0, z))
        else:
            slot = cq.Workplane('XY').box(54.0, 8.0, 12.0).translate((0, y - 4.0, z))
        c = cyl.union(slot)
        cut = c if cut is None else cut.union(c)
part = body.cut(cut)