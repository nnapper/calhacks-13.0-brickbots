body = cq.Workplane('XY').circle(36).extrude(6)
body = body.cut(cq.Workplane('XY').circle(31).extrude(1.5))
body = body.cut(cq.Workplane('XY').workplane(offset=4.5).circle(31).extrude(1.5))
body = body.cut(cq.Workplane('XY').circle(7).extrude(6))
round_pts = [(16,16),(-16,16),(16,-16),(-16,-16),(8,8),(-8,8),(8,-8),(-8,-8)]
body = body.cut(cq.Workplane('XY').pushPoints(round_pts).circle(2).extrude(6))
for sx in (-1, 1):
    body = body.cut(cq.Workplane('XY').center(sx*13.5, 0).slot2D(9, 4, 0).extrude(6))
    body = body.cut(cq.Workplane('XY').center(0, sx*13.5).slot2D(9, 4, 90).extrude(6))
part = body.rotate((0,0,0),(1,0,0),-90)