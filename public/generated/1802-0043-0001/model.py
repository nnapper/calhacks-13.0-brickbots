t = 12.0
body = cq.Workplane('XZ').rect(43, 65).extrude(-t)
window = cq.Workplane('XZ').rect(23, 41).extrude(-t)
body = body.cut(window)
thru_pts = [(-16, 28), (16, -28), (-16, -14), (16, 14)]
thru = cq.Workplane('XZ').pushPoints(thru_pts).circle(2.25).extrude(-t)
body = body.cut(thru)
tap_pts = [(-8, 24), (8, -24)]
tap = cq.Workplane('XZ', origin=(0, t, 0)).pushPoints(tap_pts).circle(2.0).extrude(8)
body = body.cut(tap)
side_r = cq.Workplane('YZ', origin=(21.5, 0, 0)).center(t / 2, 28).circle(2.0).extrude(-8)
side_l = cq.Workplane('YZ', origin=(-21.5, 0, 0)).center(t / 2, -28).circle(2.0).extrude(8)
part = body.cut(side_r).cut(side_l)