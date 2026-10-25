R=33.35
w=7.62
c=(0,R,0)
tire=cq.Workplane('XY',origin=(0,R,-w/2)).circle(R).circle(R-3).extrude(w)
plate=cq.Workplane('XY',origin=(0,R,-1.0)).circle(R-2.9).extrude(2.0)
pts=[(23.5*math.cos(math.radians(90+72*i)),R+23.5*math.sin(math.radians(90+72*i))) for i in range(5)]
win=cq.Workplane('XY',origin=(0,0,-5)).pushPoints(pts).circle(7).extrude(10)
plate=plate.cut(win)
hub=cq.Workplane('XY',origin=(0,R,-w/2)).circle(15.5).extrude(w)
part=tire.union(plate).union(hub)
bore=cq.Workplane('XY',origin=(0,R,-5)).polygon(6,5).extrude(10)
part=part.cut(bore)