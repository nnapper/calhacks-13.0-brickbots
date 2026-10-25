hub = cq.Workplane('XY').circle(16).extrude(14).translate((0,0,-7))
rollers = None
n = 10
for row, zc in enumerate((-4.85, 4.85)):
    for i in range(n):
        ang = i * 360.0 / n + row * 180.0 / n
        r = (cq.Workplane('YZ').circle(4.5).extrude(4.5, both=True)
             .translate((0, 19.5, zc)).rotate((0,0,0),(0,0,1), ang))
        rollers = r if rollers is None else rollers.union(r)
body = hub.union(rollers)
bore = cq.Workplane('XY').polygon(6, 8 / math.cos(math.radians(30))).extrude(30).translate((0,0,-15))
holes = (cq.Workplane('XY').pushPoints([(8,8),(-8,8),(8,-8),(-8,-8)]).circle(2).extrude(30).translate((0,0,-15)))
body = body.cut(bore).cut(holes)
part = body.translate((0, 24, 0))