t = 1.6
W, L = 12.7, 22.86
pcb = cq.Workplane('XY').box(W, t, L, centered=(True, False, True))
# mounting holes (2.18 mm), both on the -X side near the short ends
mount = (cq.Workplane('XZ').workplane(offset=-t - 1)
         .pushPoints([(-3.9, 8.8), (-3.9, -8.8)]).circle(1.09).extrude(t + 2))
# 0.1 in pitch header through-holes: 9 on +X edge, 5 on -X edge
pitch = 2.54
ptsA = [(5.08, (i - 4) * pitch) for i in range(9)]
ptsB = [(-5.08, (i - 2) * pitch) for i in range(5)]
pins = (cq.Workplane('XZ').workplane(offset=-t - 1)
        .pushPoints(ptsA + ptsB).circle(0.5).extrude(t + 2))
pcb = pcb.cut(mount).cut(pins)
# main components on top face
def blk(x, z, sx, sz, h):
    return cq.Workplane('XY').box(sx, h, sz, centered=(True, False, True)).translate((x, t, z))
imu = blk(1.5, -1.5, 2.5, 3.0, 0.86)
ic2 = blk(-0.5, 2.5, 1.6, 2.9, 1.0)
reg = blk(-2.0, 6.5, 1.6, 2.9, 1.1)
part = pcb.union(imu).union(ic2).union(reg)