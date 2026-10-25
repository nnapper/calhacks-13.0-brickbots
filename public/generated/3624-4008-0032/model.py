core = cq.Workplane('XY').circle(12).extrude(7, both=True)
rollers = None
for row, zc in enumerate((-3.5, 3.5)):
    for i in range(8):
        ang = i * 45 + (22.5 if row else 0)
        r = (cq.Workplane('YZ').circle(3).extrude(4, both=True)
             .translate((0, 13, zc)).rotate((0, 0, 0), (0, 0, 1), ang))
        rollers = r if rollers is None else rollers.union(r)
wheel = core.union(rollers)
bore = cq.Workplane('XY').polygon(6, 8 / math.cos(math.radians(30))).extrude(10, both=True)
part = wheel.cut(bore).translate((0, 16, 0))