gb = cq.Workplane('XY').box(70, 80, 60, centered=False).translate((-178.5, 0, -55))
tube = cq.Workplane('YZ').center(40, -25).circle(19).extrude(250).translate((-108, 0, 0))
end = cq.Workplane('YZ').center(40, -25).circle(15).extrude(38.5).translate((140, 0, 0))
motor = cq.Workplane('XY').center(-140, 40).circle(26).extrude(50).translate((0, 0, 5))
part = gb.union(tube).union(end).union(motor)
for x in (-165, 165):
    hole = cq.Workplane('XZ').center(x, -25).circle(6.5).extrude(-100)
    part = part.cut(hole)
