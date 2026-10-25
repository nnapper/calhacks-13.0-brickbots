gc=(-14,42.5)
pc=(43,42.5)
# large output gear (axis Z)
gear=cq.Workplane('XY').workplane(offset=-7.5).center(*gc).circle(42.5).extrude(8)
hub=cq.Workplane('XY').workplane(offset=0.5).center(*gc).circle(13).extrude(3)
# pinion
pinion=cq.Workplane('XY').workplane(offset=-7.5).center(*pc).circle(14.5).extrude(8)
boss=cq.Workplane('XY').workplane(offset=0.5).center(*pc).circle(4).extrude(3)
# servo body and bracket behind the gears
servo=cq.Workplane('XY').workplane(offset=-27.5).center(30,42.5).rect(52,44).extrude(20)
part=gear.union(hub).union(pinion).union(boss).union(servo)
# lightening holes in the gear
pts=[(gc[0]+30*math.cos(math.radians(a*30)),gc[1]+30*math.sin(math.radians(a*30))) for a in range(12)]
holes=cq.Workplane('XY').workplane(offset=-8).pushPoints(pts).circle(2.5).extrude(12)
part=part.cut(holes)
# hex bore for 8 mm shaft
hexcut=cq.Workplane('XY').workplane(offset=-8).center(*gc).polygon(6,9.24).extrude(13)
part=part.cut(hexcut)