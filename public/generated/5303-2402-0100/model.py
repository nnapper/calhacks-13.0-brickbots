gear_len = 62.0
can_len = 62.0 - 0.0
R_g = 18.0
cy = 18.0
z_face = 38.5
z_back = -62.0
z_split = -23.5
# gearbox section (36 mm dia)
gearbox = cq.Workplane('XY').workplane(offset=z_split).center(0, cy).circle(R_g).extrude(z_face - z_split)
# motor can (RS-560, approx 35 mm dia)
can = cq.Workplane('XY').workplane(offset=z_back).center(0, cy).circle(17.5).extrude(z_split - z_back)
# output shaft 8 mm dia, 23.5 mm long toward +Z
shaft = cq.Workplane('XY').workplane(offset=z_face).center(0, cy).circle(4.0).extrude(23.5)
part = gearbox.union(can).union(shaft)