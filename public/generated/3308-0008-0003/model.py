tab_t = 1.0
plates = None
for z in (-2.5, 2.5):
    p = cq.Workplane('XY').box(10, 8, 1).translate((0, 4, z))
    plates = p if plates is None else plates.union(p)
pins = (cq.Workplane('XY').cylinder(6, 1.5, direct=(0, 0, 1)).translate((-4, 4, 0))
        .union(cq.Workplane('XY').cylinder(6, 1.5, direct=(0, 0, 1)).translate((4, 4, 0))))
tabs = None
for x in (-7.5, 7.5):
    t = cq.Workplane('XY').box(7, tab_t, 6).translate((x, tab_t / 2, 0))
    tabs = t if tabs is None else tabs.union(t)
part = plates.union(pins).union(tabs)
holes = (cq.Workplane('XZ').pushPoints([(-8, 0), (8, 0)]).circle(2.1).extrude(-5))
part = part.cut(holes)