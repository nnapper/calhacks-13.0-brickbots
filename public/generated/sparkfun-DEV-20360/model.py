def bx(sx, sy, sz, cx, y0, cz):
    return cq.Workplane('XY').box(sx, sy, sz, centered=(True, False, True)).translate((cx, y0, cz))

L, W = 60.96, 17.78
pitch = 2.54
row = 7.62
plastic_y0, plastic_h = 6.0, 2.54
pcb_y0 = plastic_y0 + plastic_h
pcb_t = 1.6
top = pcb_y0 + pcb_t

part = bx(L, pcb_t, W, 0, pcb_y0, 0)

for s in (-1, 1):
    part = part.union(bx(L - 1.0, plastic_h, pitch, 0, plastic_y0, s * row))
    for i in range(24):
        x = -29.21 + i * pitch
        part = part.union(bx(0.64, plastic_y0 + plastic_h, 0.64, x, 0, s * row))

# main processor
part = part.union(bx(10, 1.0, 10, 4, top, 0))
# microSD socket at -X end
part = part.union(bx(14, 1.5, 12, -L / 2 + 5, top, 0))
# micro-USB connector at +X end
part = part.union(bx(6, 2.6, 8, L / 2 - 2, top, 0))
# pushbutton
part = part.union(bx(3, 1.5, 3, -12, top, 0))