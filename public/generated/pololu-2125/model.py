pcb_t = 1.6
chip_h = 1.4
board = cq.Workplane('XY').box(12.7, pcb_t, 22.86, centered=(True, False, True))
mount_pts = [(-4.2, 8.9), (-4.2, -8.9)]
header_pts = [(5.08, (i - 4) * 2.54) for i in range(9)]
board = board.cut(cq.Workplane('XZ').pushPoints(mount_pts).circle(2.18 / 2).extrude(-3))
board = board.cut(cq.Workplane('XZ').pushPoints(header_pts).circle(0.5).extrude(-3))
chip = cq.Workplane('XY').box(4, chip_h, 4, centered=(True, False, True)).translate((-2.5, pcb_t, -2))
part = board.union(chip)