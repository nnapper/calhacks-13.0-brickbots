body = cq.Workplane('YZ').workplane(offset=-24.05).center(7.25, 0).circle(7.25).extrude(49.3)
button = cq.Workplane('YZ').workplane(offset=-25.25).center(7.25, 0).circle(2.75).extrude(1.3)
part = body.union(button)