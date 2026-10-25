ball_r = 9.525/2
cy = ball_r
cyl = cq.Workplane('XZ', origin=(0, 11, 0)).circle(5.08).extrude(11 - cy)
ear = cq.Workplane('XY').box(18, 2.2, 7.0).translate((0, 9.9, 0))
housing = cyl.union(ear)
cavity = cq.Workplane('XY').sphere(ball_r).translate((0, cy, 0))
housing = housing.cut(cavity)
holes = cq.Workplane('XZ', origin=(0, 11, 0)).pushPoints([(-6.73, 0), (6.73, 0)]).circle(1.2).extrude(3)
housing = housing.cut(holes)
ball = cq.Workplane('XY').sphere(ball_r).translate((0, cy, 0))
part = housing.union(ball)