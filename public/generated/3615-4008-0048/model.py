hub = cq.Workplane('XY').circle(10).extrude(8, both=True)
profile = [(0,-3.5),(16,-3.5),(18.5,-6.5),(23,-6.5),(23,6.5),(18.5,6.5),(16,3.5),(0,3.5)]
spoke = cq.Workplane('XY').polyline(profile).close().extrude(8, both=True)
body = hub
for i in range(6):
    body = body.union(spoke.rotate((0,0,0),(0,0,1),i*60))
bore = cq.Workplane('XY').polygon(6, 8/math.cos(math.pi/6)).extrude(10, both=True)
part = body.cut(bore).translate((0,24,0))