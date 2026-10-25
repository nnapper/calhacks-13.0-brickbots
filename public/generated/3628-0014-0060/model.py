t=6
body=cq.Workplane('XZ').circle(30).extrude(-t)
pts_o=[(17,17),(-17,17),(-17,-17),(17,-17)]
pts_i=[(8.5,8.5),(-8.5,8.5),(-8.5,-8.5),(8.5,-8.5)]
bore=cq.Workplane('XZ').circle(7).extrude(-t)
outer=cq.Workplane('XZ').pushPoints(pts_o).circle(2.1).extrude(-t)
inner=cq.Workplane('XZ').pushPoints(pts_i).circle(2.1).extrude(-t)
part=body.cut(bore).cut(outer).cut(inner)