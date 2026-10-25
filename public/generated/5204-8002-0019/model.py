r_g = 18.5
cy = 18.5
# Z runs along the motor axis from -40 (output end) to +40
shaft = cq.Workplane('XY', origin=(0, cy, -40)).circle(4).extrude(16)
gearbox = cq.Workplane('XY', origin=(0, cy, -24)).circle(r_g).extrude(28)
motor = cq.Workplane('XY', origin=(0, cy, 4)).circle(18).extrude(36)
part = shaft.union(gearbox).union(motor)