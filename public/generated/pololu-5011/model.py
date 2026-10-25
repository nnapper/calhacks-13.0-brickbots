tw=13.0
track_x=49-tw/2
tracks=cq.Workplane('XY').pushPoints([(-track_x,50),(track_x,50)]).box(tw,100,40)
chassis=cq.Workplane('XY').center(0,48).box(72,96,30)
board=cq.Workplane('XY').workplane(offset=15).center(0,45).rect(68,80).extrude(3)
blade=cq.Workplane('XY').center(0,98).box(72,4,24)
part=tracks.union(chassis).union(board).union(blade)
part=part.translate((0,0,0))