pcb_t = 1.0
z0 = -2.25
body = cq.Workplane('XY').workplane(offset=z0).center(0, 11.0).rect(16.5, 11.0).extrude(pcb_t)
tab = cq.Workplane('XY').workplane(offset=z0).center(0, 2.75).rect(10.0, 5.5).extrude(pcb_t)
board = body.union(tab)
conn = (cq.Workplane('XY').workplane(offset=z0 + pcb_t)
        .center(6.6, 10.0).rect(4.3, 8.0).extrude(3.5))
part = board.union(conn)
hole = cq.Workplane('XY').workplane(offset=z0 - 1).center(0, 9.75).circle(2.5).extrude(6)
part = part.cut(hole)