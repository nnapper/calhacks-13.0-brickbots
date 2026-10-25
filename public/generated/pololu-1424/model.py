R=30.0
W=8.0
cy=30.0
tire=(cq.Workplane('XY').circle(R).circle(27.5).extrude(W).translate((0,0,-W/2)))
rim=(cq.Workplane('XY').circle(27.5).circle(25.5).extrude(7).translate((0,0,-3.5)))
hub=cq.Workplane('XY').circle(5.5).extrude(W).translate((0,0,-W/2))
wheel=tire.union(rim).union(hub)
for i in range(5):
    sp=(cq.Workplane('XY').center(13.5,0).rect(27,3).extrude(4).translate((0,0,-2)).rotate((0,0,0),(0,0,1),90+72*i))
    wheel=wheel.union(sp)
bore=cq.Workplane('XY').circle(1.5).extrude(12).translate((0,0,-6))
flat=cq.Workplane('XY').center(0,-0.25).rect(4,2.5).extrude(12).translate((0,0,-6))
bore=bore.intersect(flat)
wheel=wheel.cut(bore)
holes=cq.Workplane('XY').pushPoints([(-6.35,0),(6.35,0)]).circle(1.5).extrude(12).translate((0,0,-6))
wheel=wheel.cut(holes)
part=wheel.translate((0,cy,0))