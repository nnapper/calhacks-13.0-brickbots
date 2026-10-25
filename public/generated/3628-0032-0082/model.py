t = 6.4
r_out = 35.0
outer_pts = [(r_out*math.cos(math.radians(22.5+45*k)), r_out*math.sin(math.radians(22.5+45*k))) for k in range(8)]
inner_pts = [(20*math.cos(math.radians(45+90*k)), 20*math.sin(math.radians(45+90*k))) for k in range(4)]

# base disc (thickness along +Y, bottom at Y=0)
plate = cq.Workplane('XZ').circle(41).extrude(-t)
# large central opening
plate = plate.cut(cq.Workplane('XZ').circle(26).extrude(-t))
# four inward lobes on the diagonals
for a in (45, 135, 225, 315):
    lobe = (cq.Workplane('XY').box(14, t, 16, centered=(True, False, True))
            .translate((20, 0, 0)).rotate((0, 0, 0), (0, 1, 0), a))
    plate = plate.union(lobe)
# outer mounting holes
plate = plate.cut(cq.Workplane('XZ').pushPoints(outer_pts).circle(2.1).extrude(-t))
# inner small through holes
plate = plate.cut(cq.Workplane('XZ').pushPoints(inner_pts).circle(2.1).extrude(-t))
# hex pockets from the top face
plate = plate.cut(cq.Workplane('XZ').workplane(offset=-t).pushPoints(inner_pts).polygon(6, 8).extrude(3))
part = plate