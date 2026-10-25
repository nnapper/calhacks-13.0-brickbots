pl = cq.Plane(origin=(0, 0, 0), xDir=(1, 0, 0), normal=(0, 1, 0))
body = cq.Workplane(pl).rect(35.2, 35.2).extrude(28)
boss = cq.Workplane(pl).workplane(offset=28).circle(11).extrude(2)
shaft = cq.Workplane(pl).workplane(offset=28).circle(2.5).extrude(21)
pts = [(-13, -13), (13, -13), (-13, 13), (13, 13)]
holes = cq.Workplane(pl).workplane(offset=25).pushPoints(pts).circle(1.5).extrude(3)
part = body.union(boss).union(shaft).cut(holes)