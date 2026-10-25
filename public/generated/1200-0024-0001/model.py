boss = cq.Workplane('XY').center(0,24).circle(16).extrude(4, both=True)
legs = cq.Workplane('XY').center(0,7).rect(30,14).extrude(4, both=True)
part = boss.union(legs)
# U relief between posts
part = part.cut(cq.Workplane('XY').center(0,4.25).rect(18,8.5).extrude(5, both=True))
# center bore and 1 mm deep counterbore on +Z face
part = part.cut(cq.Workplane('XY').center(0,24).circle(7).extrude(5, both=True))
part = part.cut(cq.Workplane('XY').workplane(offset=3).center(0,24).circle(8).extrude(1))
# four M4 holes (modeled as 3.3 mm tap drill, 7 mm deep) from +Z face
m4 = [(11.31,24),(-11.31,24),(0,35.31),(0,12.69)]
part = part.cut(cq.Workplane('XY').workplane(offset=-3).pushPoints(m4).circle(1.65).extrude(7))
# four 4 mm through holes on diagonals
sl = [(8.49,32.49),(-8.49,32.49),(8.49,15.51),(-8.49,15.51)]
part = part.cut(cq.Workplane('XY').pushPoints(sl).circle(2).extrude(5, both=True))
# two M4 post holes in bottom faces, 7 mm deep
part = part.cut(cq.Workplane('XZ').pushPoints([(-12,0),(12,0)]).circle(1.65).extrude(-7))