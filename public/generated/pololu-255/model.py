R = 63.5
T = 3.0
S = 0.338
base = cq.Workplane('XZ').circle(R).extrude(-T)

def rect(x, z, w, h):
    return cq.Workplane('XZ').center(x, z).rect(w, h).extrude(-T)

def slot(x, z, l, w):
    return cq.Workplane('XZ').center(x, z).slot2D(l, w).extrude(-T)

def hole(x, z, d):
    return cq.Workplane('XZ').center(x, z).circle(d / 2).extrude(-T)

cuts = [
    rect(-45, 11, 23, 32),
    rect(45.6, -2.7, 25, 38),
    rect(-27.4, 38, 7.5, 13.5),
    rect(-26.4, -23.7, 8.5, 14),
    slot(-23.7, 50.7, 15, 3),
    slot(33.5, 44.6, 16, 3),
    slot(-34, -38, 16, 3),
    slot(-5.4, -52.4, 29, 3),
    hole(-17.9, 4.7, 6),
    hole(17.2, 1, 6),
]
part = base
for c in cuts:
    part = part.cut(c)
