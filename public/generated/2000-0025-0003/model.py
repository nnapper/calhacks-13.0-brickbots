case_l, case_w = 28.0, 20.2
zb, zt = -18.25, 8.75
cy = 10.1
case = cq.Workplane('XY').box(case_l, case_w, zt - zb).translate((0, cy, (zt + zb) / 2))
flange = cq.Workplane('XY').box(40.5, case_w, 2.5).translate((0, cy, -5.25))
holes = (cq.Workplane('XY').workplane(offset=-8)
    .pushPoints([(-17.2, cy - 5), (-17.2, cy + 5), (17.2, cy - 5), (17.2, cy + 5)])
    .circle(2.25).extrude(6))
boss = cq.Workplane('XY').workplane(offset=zt).center(7, cy).circle(6).extrude(3.0)
shaft = cq.Workplane('XY').workplane(offset=zt + 3.0).center(7, cy).circle(3.5).extrude(18.25 - (zt + 3.0))
part = case.union(flange).union(boss).union(shaft).cut(holes)