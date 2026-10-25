R = 48.5
CY = 48.5
H = 30.0
ring = cq.Workplane('XY').center(0, CY).circle(R).circle(R - 3).extrude(H / 2, both=True)
plate = cq.Workplane('XY').workplane(offset=-H / 2).center(0, CY).circle(R - 2).extrude(3)
batt = cq.Workplane('XY').box(40, 50, 12, centered=(True, True, False)).translate((0, CY, -H / 2 + 3))
wheel_r = 15.0
wheel_r_side = cq.Workplane('YZ').workplane(offset=43).center(CY, 0).circle(wheel_r).extrude(7)
wheel_l_side = cq.Workplane('YZ').workplane(offset=-50).center(CY, 0).circle(wheel_r).extrude(7)
part = ring.union(plate).union(batt).union(wheel_r_side).union(wheel_l_side)