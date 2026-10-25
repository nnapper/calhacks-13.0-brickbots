d=10.0
h=3.4
# Coin motor body: disc axis along Y, bottom at Y=0, centered on X and Z
body = cq.Workplane('XZ').circle(d/2).extrude(-h)
# Small solder tab block at one edge, where the leads attach
tab = cq.Workplane('XY').box(0.8, 1.6, 1.8, centered=(False, False, True)).translate((d/2 - 0.1, h/2 - 0.8, 0))
# Two short stub leads (red and blue) leaving radially along +X, merged into one solid
lead1 = cq.Workplane('YZ').center(h/2 + 0.3, 0.5).circle(0.25).extrude(4.0).translate((d/2 + 0.6, 0, 0))
lead2 = cq.Workplane('YZ').center(h/2 - 0.3, -0.5).circle(0.25).extrude(4.0).translate((d/2 + 0.6, 0, 0))
part = body.union(tab).union(lead1).union(lead2)