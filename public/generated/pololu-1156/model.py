body = cq.Workplane('XY').box(58, 29, 48, centered=(True, False, True))
for z in (-16, 0, 16):
    cyl = cq.Workplane('YZ').workplane(offset=-26).center(22, z).circle(7.4).extrude(52)
    slot = cq.Workplane('XY').box(52, 8, 14.8, centered=(True, False, True)).translate((0, 22, z))
    body = body.cut(cyl).cut(slot)
part = body