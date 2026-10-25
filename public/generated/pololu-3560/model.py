import_ok = True
R = 80
box = cq.Workplane('XY').box(160, 85, 10, centered=(True, False, True))
disc = cq.Workplane('XY').workplane(offset=-5).center(0, 5).circle(R).extrude(10)
outer = disc.intersect(box)
# hollow underside leaving a 3 mm perimeter rim and a 3 mm top deck (z 2..5)
inner_box = cq.Workplane('XY').box(154, 82, 7, centered=(True, False, True)).translate((0, 3, -1.5))
inner_disc = cq.Workplane('XY').workplane(offset=-5).center(0, 5).circle(R - 3).extrude(7)
inner = inner_disc.intersect(inner_box)
body = outer.cut(inner)
# round mounting hole grid
pts = [(x, y) for x in range(-60, 61, 10) for y in range(15, 76, 10) if math.hypot(x, y - 5) < 66]
holes = cq.Workplane('XY').workplane(offset=-5).pushPoints(pts).circle(1.75).extrude(10)
# a few slots
slot_pts = [(-30, 35), (0, 45), (30, 35), (0, 20)]
slots = cq.Workplane('XY').workplane(offset=-5).pushPoints(slot_pts).slot2D(14, 3.5, 0).extrude(10)
part = body.cut(holes).cut(slots)