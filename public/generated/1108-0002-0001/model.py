pts=[(-29.9,0),(10.1,0),(10.1,27.7),(29.8,47.4),(1.4,75.8),(-29.9,44.2)]
part=cq.Workplane('XY').polyline(pts).close().extrude(3).translate((0,0,-1.5))
xs=[-25.9,-17.9,-9.9,-1.9,6.1]
grid=[(x,y) for x in xs for y in (4.1,12.0)]
ring=[(-9.9,48.1),(-9.9,24.1),(-21.9,36.1),(2.1,36.1),(-17.9,44.1),(-1.9,44.1),(-17.9,28.1),(-1.9,28.1)]
up=[(1.4,70.1),(-4.2,64.5),(7.1,64.5),(1.4,58.8),(12.8,58.8),(7.1,53.1),(18.4,53.1),(12.8,47.8),(24.2,47.8),(18.4,41.8)]
small=cq.Workplane('XY').workplane(offset=-5).pushPoints(grid+ring+up).circle(2).extrude(10)
bore=cq.Workplane('XY').workplane(offset=-5).center(-9.9,36.1).circle(7).extrude(10)
part=part.cut(small).cut(bore)