R = 16.0
W = 7.0
cy = R

# silicone tire ring (axle along Z, wheel centre at Y=16 so the bottom sits at Y=0)
tire = cq.Workplane('XY').center(0, cy).circle(R).circle(14.0).extrude(W / 2, both=True)

# white rim ring
rim = cq.Workplane('XY').center(0, cy).circle(14.0).circle(12.5).extrude(2.5, both=True)

# central hub
hub = cq.Workplane('XY').center(0, cy).circle(4.0).extrude(3.0, both=True)

part = tire.union(rim).union(hub)

# three spokes at 120 degrees
for a in (90, 210, 330):
    spoke = (cq.Workplane('XY').box(12.0, 3.5, 5.0)
             .translate((6.5, 0, 0))
             .rotate((0, 0, 0), (0, 0, 1), a)
             .translate((0, cy, 0)))
    part = part.union(spoke)

# D-shaped through bore for the 3 mm D shaft
dcyl = cq.Workplane('XY').center(0, cy).circle(1.5).extrude(5, both=True)
dbox = cq.Workplane('XY').box(3.2, 3.2, 12).translate((-0.2 - 1.6 + 1.6, cy, 0)).translate((-0.2, 0, 0))
dbore = dcyl.intersect(cq.Workplane('XY').box(2.7, 4, 12).translate((-0.15, cy, 0)))
part = part.cut(dbore)