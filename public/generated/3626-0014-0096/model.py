outer = cq.Workplane('XY').workplane(offset=-12).circle(48).extrude(24)
recess = cq.Workplane('XY').workplane(offset=2).circle(40).circle(22).extrude(10)
bore = cq.Workplane('XY').workplane(offset=-12).circle(8).extrude(24)
part = outer.cut(recess).cut(bore).translate((0, 48, 0))