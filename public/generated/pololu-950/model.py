ball_d = 9.525
r = ball_d / 2
H = 10.16
Y = cq.Vector(0, 1, 0)

def cyl(rad, h, y0, x=0):
    return cq.Workplane(obj=cq.Solid.makeCylinder(rad, h, cq.Vector(x, y0, 0), Y))

# housing cup around the ball, open at the bottom
cup = cyl(6.0, H - 3.0, 3.0)
cup = cup.cut(cyl(3.6, 5.5, 0.0))

# mounting ears along X
ears = cq.Workplane('XY').box(19.0, 1.66, 6.0, centered=(True, False, True)).translate((0, H - 1.66, 0))
housing = cup.union(ears)

# screw holes through the ears (vertical, along Y)
for x in (-6.731, 6.731):
    housing = housing.cut(cyl(1.2, 4.0, H - 3.0, x))

# plastic ball, bottom at Y=0
ball = cq.Workplane('XY').sphere(r).translate((0, r, 0))

part = housing.union(ball)