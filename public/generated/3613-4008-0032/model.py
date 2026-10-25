part = (cq.Workplane('XY').center(0, 16).circle(16).extrude(8, both=True)
        .cut(cq.Workplane('XY').center(0, 16).polygon(6, 8 / math.cos(math.pi / 6)).extrude(10, both=True)))