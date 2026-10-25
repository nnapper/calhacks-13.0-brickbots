cell_d = 15.0
L = 51.0
pitch_z = 21.5
pts = [(cell_d/2 + row*cell_d, z) for row in (0, 1) for z in (-pitch_z, 0, pitch_z)]
cells = (cq.Workplane('YZ').pushPoints(pts).circle(cell_d/2).extrude(L).translate((-L/2, 0, 0)))
core = cq.Workplane('XY').box(L, 16.0, 2*pitch_z, centered=(True, True, True)).translate((0, 15.0, 0))
part = cells.union(core)