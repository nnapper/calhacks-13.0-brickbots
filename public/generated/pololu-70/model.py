def cyl(x0, L, r, y=25, z=0):
    return cq.Workplane('YZ').workplane(offset=x0).center(y, z).circle(r).extrude(L)

# motor, gearbox stack, output boss, output shaft (all on the X axis at Y=25)
motor = cyl(-47.5, 27.5, 12)
gear = cyl(-20, 52, 19)
boss = cyl(32, 3, 8)
shaft = cyl(35, 12.5, 2)

# two tie rods along the housing
rod_top = cyl(-20, 52, 3, y=25 + 19)
rod_bot = cyl(-20, 52, 3, y=25 - 19)

# output-end L bracket: base plate at Y=0 plus upright plate
out_base = cq.Workplane('XY').box(14, 1.5, 32, centered=(False, False, True)).translate((32, 0, 0))
out_up = cq.Workplane('XY').box(1.5, 22, 32, centered=(False, False, True)).translate((32, 0, 0))

# motor-end L bracket
m_base = cq.Workplane('XY').box(14, 1.5, 20, centered=(False, False, True)).translate((-22, 0, 0))
m_up = cq.Workplane('XY').box(1.5, 15, 20, centered=(False, False, True)).translate((-21.5, 0, 0))

part = motor.union(gear).union(boss).union(shaft).union(rod_top).union(rod_bot)
for s in (out_base, out_up, m_base, m_up):
    part = part.union(s)
