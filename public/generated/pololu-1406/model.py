flange = cq.Workplane('XY').workplane(offset=7.35).center(0, 7.55).rect(21.2, 15.1).extrude(2.1)
body = cq.Workplane('XY').workplane(offset=-3.75).center(0, 7.55).rect(18.8, 13.0).extrude(11.1)
rocker = cq.Workplane('XY').workplane(offset=9.45).center(0, 7.55).rect(16.0, 9.2).extrude(3.5)
part = flange.union(body).union(rocker)
for x in (-6.95, 0, 6.95):
    tab = cq.Workplane('XY').workplane(offset=-12.95).center(x, 7.55).rect(4.8, 0.8).extrude(9.2)
    part = part.union(tab)