import_math = math
L, W, T = 56.0, 32.0, 2.5
c = L/2 - W/2  # 12 mm end-arc centers
big = [(-c, 0), (c, 0)]
small = [(-4, -8), (-4, 8), (4, -8), (4, 8)]
for s in (-1, 1):
    for a in (-90, -45, 0, 45, 90):
        ang = math.radians(a)
        small.append((s*c + s*12*math.cos(ang), 12*math.sin(ang)))
plate = cq.Workplane('XZ').slot2D(L, W).extrude(-T)
plate = plate.faces('>Y').workplane(centerOption='CenterOfBoundBox').pushPoints(big).hole(14)
plate = plate.faces('>Y').workplane(centerOption='CenterOfBoundBox').pushPoints(small).hole(4)
part = plate