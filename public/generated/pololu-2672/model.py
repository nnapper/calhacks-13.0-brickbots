r = 11
h = (cq.Workplane('XY').circle(11).extrude(7)
     .faces('>Z').workplane().circle(9).extrude(5))
# central 4 mm shaft bore
h = h.cut(cq.Workplane('XY').circle(2).extrude(12))
# three axial M3 screw holes on the small step (blind, 8 mm deep)
pts = [(0, 5.5), (-4.76, -2.75), (4.76, -2.75)]
h = h.cut(cq.Workplane('XY').workplane(offset=4).pushPoints(pts).circle(1.5).extrude(8))
# two radial set-screw holes in the large step, from +X into the bore
h = h.cut(cq.Workplane('YZ').pushPoints([(0, 1.8), (0, 5.2)]).circle(1.65).extrude(11))
# build axis was Z; rotate so the hub axis is Y with bottom at Y=0
part = h.rotate((0, 0, 0), (1, 0, 0), -90)