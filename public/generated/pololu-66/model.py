base = cq.Workplane('XY').box(25, 3, 25, centered=(True, False, True))
posts = cq.Workplane('XY')
for x in (-5.5, 5.5):
    for z in (-5.5, 5.5):
        posts = posts.union(cq.Workplane('XY').add(cq.Solid.makeCylinder(3, 29, cq.Vector(x, 3, z), cq.Vector(0, 1, 0))))
holder = cq.Workplane('XY').add(cq.Solid.makeCylinder(8, 27, cq.Vector(0, 3, 0), cq.Vector(0, 1, 0)))
ball = cq.Workplane('XY').add(cq.Solid.makeSphere(6, cq.Vector(0, 29, 0), cq.Vector(0, 1, 0), 0, 90, 360)).union(
    cq.Workplane('XY').add(cq.Solid.makeSphere(6, cq.Vector(0, 29, 0), cq.Vector(0, 1, 0), -90, 0, 360)))
body = base.union(posts).union(holder).union(ball)
cutters = cq.Workplane('XY')
for x in (-10, 10):
    for z in (-10, 10):
        cutters = cutters.union(cq.Workplane('XY').add(cq.Solid.makeCylinder(1.5, 3, cq.Vector(x, 0, z), cq.Vector(0, 1, 0))))
part = body.cut(cutters)