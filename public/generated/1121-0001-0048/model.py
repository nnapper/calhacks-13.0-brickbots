base = cq.Workplane('XY').box(48, 12, 48, centered=(True, False, True))
inner = cq.Workplane('XY').box(43, 10, 52, centered=(True, False, True)).translate((0, 2.5, 0))
part = base.cut(inner)
grid = [(x, z) for x in (-16, -8, 8, 16) for z in (-16, -8, 8, 16)]
base_holes = cq.Workplane('XZ').pushPoints(grid).circle(2).extrude(-2.5)
bore = cq.Workplane('XZ').circle(7).extrude(-2.5)
flange_holes = (cq.Workplane('YZ').workplane(offset=-25)
    .pushPoints([(8, z) for z in (-16, -8, 0, 8, 16)]).circle(2).extrude(50))
part = part.cut(base_holes).cut(bore).cut(flange_holes)