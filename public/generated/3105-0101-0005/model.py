bw=15.5
yc=bw/2
x0=-20.15
body_x0=x0+40.3-28.5
# heat-shrink PCB body (z -1.2..3.3)
body=cq.Workplane('XY').box(28.5,bw,4.5,centered=False).translate((body_x0,0,-1.2))
# round spacer at tab end (z -3.3..2.3, height 5.6)
spacer=cq.Workplane('XY').workplane(offset=-3.3).center(-15.3,yc).circle(4.85).extrude(5.6)
# PCB tab bridging spacer and body
tab=cq.Workplane('XY').box(body_x0+0.5+15.3,9.7,1.6,centered=False).translate((-15.3,yc-4.85,0.7))
part=body.union(spacer).union(tab)
hole=cq.Workplane('XY').workplane(offset=-4).center(-15.3,yc).circle(2).extrude(9)
part=part.cut(hole)