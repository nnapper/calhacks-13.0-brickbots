prof = (cq.Workplane('XY').moveTo(4, -20).lineTo(7, -20).threePointArc((10, 0), (7, 20)).lineTo(4, 20).close())
body = prof.revolve(360, (0, 0, 0), (0, 1, 0))
part = body.rotate((0, 0, 0), (1, 0, 0), 90).translate((0, 10, 0))