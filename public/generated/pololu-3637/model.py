pts=[(0,-15),(30,-15),(50,0),(50,15),(36,15)]
fl=cq.Workplane('YZ').workplane(offset=14).polyline(pts).close().extrude(3)
fr=cq.Workplane('YZ').workplane(offset=-17).polyline(pts).close().extrude(3)
base=cq.Workplane('XY').box(34,32,3,centered=(True,False,False)).translate((0,0,-15))
pin=cq.Workplane('YZ').workplane(offset=-17).center(42,6).circle(6.3).extrude(34)
part=base.union(fl).union(fr).union(pin)
hole=cq.Workplane('XY').workplane(offset=-16).center(0,18).circle(4).extrude(5)
part=part.cut(hole)