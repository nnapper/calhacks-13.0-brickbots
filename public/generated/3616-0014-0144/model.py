w=52
R=72
body=cq.Workplane('XY').workplane(offset=-w/2).center(0,R).circle(R).extrude(w)
pocket=cq.Workplane('XY').workplane(offset=w/2-40).center(0,R).circle(60).extrude(40)
hub=cq.Workplane('XY').workplane(offset=-w/2).center(0,R).circle(16).extrude(36)
bore=cq.Workplane('XY').workplane(offset=-w/2).center(0,R).circle(7).extrude(w)
part=body.cut(pocket).union(hub).cut(bore)