def block(x0, foot_low):
    k = cq.Workplane('YZ').workplane(offset=x0).center(16, 0).circle(4).extrude(8)
    yc = 8 if foot_low else 24
    f = cq.Workplane('XY').box(8, 16, 4).translate((x0 + 4, yc, -2))
    f = f.edges('|Z and <Y' if foot_low else '|Z and >Y').fillet(3.5)
    hy = 5 if foot_low else 27
    h = cq.Workplane('XY').workplane(offset=-5).center(x0 + 4, hy).circle(2).extrude(6)
    return k.union(f).cut(h)

part = block(-12, True).union(block(-4, False)).union(block(4, True))
bore = cq.Workplane('YZ').workplane(offset=-12).center(16, 0).circle(1.5).extrude(24)
part = part.cut(bore)