body_len = 104.14
body_w = 14.478
body_t = 0.508
tail_len = 30.48
tail_w = 6.0
tail_t = 0.254
total = body_len + tail_len
x0 = -total / 2

body = (cq.Workplane('XY')
        .box(body_len, body_t, body_w, centered=(False, False, True))
        .translate((x0, 0, 0)))
tail = (cq.Workplane('XY')
        .box(tail_len, tail_t, tail_w, centered=(False, False, True))
        .translate((x0 + body_len, 0, 0)))
part = body.union(tail)