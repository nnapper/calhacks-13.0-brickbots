bw, bl, bt = 25.4, 30.48, 1.6
board = cq.Workplane('XY').box(bw, bt, bl).translate((0, bt/2, 0))
# two mounting holes along the Y axis
holes = [cq.Solid.makeCylinder(1.15, bt + 2, cq.Vector(x, -1, 13.1), cq.Vector(0, 1, 0)) for x in (-10, 10)]
for h in holes:
    board = board.cut(cq.Workplane('XY').add(h))
# driver IC
ic = cq.Workplane('XY').box(6, 0.9, 6).translate((3, bt + 0.45, 0))
# electrolytic capacitor
cap = cq.Workplane('XY').add(cq.Solid.makeCylinder(3.15, 5.4, cq.Vector(-6, bt, 9), cq.Vector(0, 1, 0)))
# small SMD tantalum capacitor and MOSFET
tan = cq.Workplane('XY').box(3.2, 1.6, 1.6).translate((-1.5, bt + 0.8, 8))
fet = cq.Workplane('XY').box(4.5, 1.0, 3.5).translate((4, bt + 0.5, 11))
part = board.union(ic).union(cap).union(tan).union(fet)