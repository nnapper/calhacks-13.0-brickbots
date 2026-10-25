def plate(y0, t):
    a = cq.Workplane('XY').box(42.5, t, 42, centered=False).translate((-42.5, y0, -21))
    b = cq.Workplane('XY').box(69, t, 32, centered=False).translate((-42.5, y0, -16))
    c = cq.Workplane('XZ').center(26.5, 0).circle(16).extrude(-t).translate((0, y0, 0))
    return a.union(b).union(c)

t = 4
y_top = 27
part = plate(0, t).union(plate(y_top, t))

for x, z in [(-38.5, 15), (-38.5, -15), (14, 13), (14, -13)]:
    so = cq.Workplane('XZ').center(x, z).polygon(6, 6.4).extrude(-(y_top - t)).translate((0, t, 0))
    part = part.union(so)

hub = cq.Workplane('XZ').center(26.5, 0).circle(16).extrude(-7).translate((0, y_top + t, 0))
shaft = cq.Workplane('XZ').center(26.5, 0).circle(3).extrude(-(53.6 - (y_top + t))).translate((0, y_top + t, 0))
part = part.union(hub).union(shaft)

pts = [(26.5, 11.3), (26.5, -11.3), (37.8, 0), (15.2, 0)]
holes = cq.Workplane('XZ').pushPoints(pts).circle(2).extrude(-60)
part = part.cut(holes)