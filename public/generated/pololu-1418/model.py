body = cq.Workplane('XY').box(80, 32.4, 62, centered=(True, False, True)).translate((0, 5, 0))
plate = cq.Workplane('XY').box(76, 1.6, 60, centered=(True, False, True)).translate((0, 37.4, 0))

def track(z0):
    outer = cq.Workplane('XY').slot2D(98, 30).extrude(13)
    inner = cq.Workplane('XY').slot2D(92, 24).extrude(13)
    return outer.cut(inner).translate((0, 15, z0))

part = body.union(plate).union(track(30)).union(track(-43))