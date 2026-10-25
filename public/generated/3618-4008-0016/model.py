R = 5 / math.sqrt(3)
pts = [(R * math.cos(math.radians(90 + 60 * i)), R * math.sin(math.radians(90 + 60 * i))) for i in range(6)]
body = cq.Workplane('XZ').circle(8).extrude(-16)
bore = cq.Workplane('XZ').polyline(pts).close().extrude(-16)
part = body.cut(bore)