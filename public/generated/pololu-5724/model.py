r = 12.2
cy = 12.5
motor = cq.Workplane('YZ', origin=(-33.25, cy, 0)).circle(r).extrude(33.0)
gear = cq.Workplane('YZ', origin=(-0.25, cy, 0)).circle(r).extrude(21.0)
shaft = cq.Workplane('YZ', origin=(20.75, cy, 0)).circle(2.0).extrude(12.5)
flat_cut = cq.Workplane('XY').box(10, 4, 2, centered=(False, True, False)).translate((23.25, cy, 1.5))
shaft = shaft.cut(flat_cut)
holes = cq.Workplane('YZ', origin=(16.75, cy, 0)).pushPoints([(0, 8), (0, -8)]).circle(1.5).extrude(4.0)
part = motor.union(gear).union(shaft).cut(holes)