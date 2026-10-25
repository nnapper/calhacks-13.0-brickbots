bat = cq.Workplane('XY').box(70, 22, 100, centered=(True, False, True))
board = cq.Workplane('XY').workplane(offset=22).box(70, 1.6, 100, centered=(True, False, True))
part = bat.union(board)
for s in (-1, 1):
    mot = (cq.Workplane('YZ').workplane(offset=35 if s > 0 else -50)
           .center(11, 0).circle(10).extrude(15))
    part = part.union(mot)
for x0 in (-34, 30):
    ring = (cq.Workplane('YZ').workplane(offset=x0).center(37, 0)
            .ellipse(13, 57.5).ellipse(9, 53.5).extrude(4))
    part = part.union(ring)
for z in (-30, 30):
    bar = cq.Workplane('XY').box(68, 6, 4, centered=(True, False, True)).translate((0, 34, z))
    part = part.union(bar)
