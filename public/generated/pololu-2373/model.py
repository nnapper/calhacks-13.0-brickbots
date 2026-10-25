def cyl(x0, length, d):
    return cq.Workplane('YZ', origin=(x0, 6, 0)).circle(d / 2).extrude(length)

def blk(x0, length, h, w):
    return cq.Workplane('YZ', origin=(x0, 6, 0)).rect(h, w).extrude(length)

x_start = -21.25
# D-shaped output shaft (3 mm dia, 9 mm long)
shaft = cyl(x_start, 9, 3)
flat_cut = cq.Workplane('XY').box(9, 4, 1).translate((x_start + 4.5, 6, 1.7))
shaft = shaft.cut(flat_cut)
# gearbox plates and spacer
plate_f = blk(-12.25, 1.0, 12, 10)
plate_m = blk(-5.5, 1.0, 12, 10)
plate_r = blk(0.75, 1.0, 12, 10)
spacer = blk(-11.25, 12.0, 7, 6)
# motor can
can = blk(1.75, 15, 12, 10)
# rear shaft (1 mm dia, 4.5 mm long)
rear = cyl(16.75, 4.5, 1)
part = shaft.union(plate_f).union(plate_m).union(plate_r).union(spacer).union(can).union(rear)