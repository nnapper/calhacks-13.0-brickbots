def box(x,y,z,cx,cy,cz):
    return cq.Workplane('XY').box(x,y,z).translate((cx,cy,cz))

# PCB: 31 (X) x 1.6 (Y, up) x 23 (Z)
board = box(31,1.6,23,0,0.8,0)
holes = (cq.Workplane('XZ').pushPoints([(-13.5,-10),(-13.5,10),(13.5,-10),(13.5,10)])
         .circle(1.55).extrude(-5).translate((0,-1,0)))
board = board.cut(holes)

# Relay body (Omron G5LE style)
relay = box(20.5,15.3,16.5,-2.5,1.6+15.3/2,0)

# 3-position screw terminal block on +X edge
term = box(6.5,10,15,12.25,1.6+5,0)

# 5-pin header on -X edge: plastic base + square pins up to Y=19
hdr = box(2.54,2.5,12.7,-14.2,1.6+1.25,0)
for i in range(5):
    z = (i-2)*2.54
    hdr = hdr.union(box(0.64,19-1.6,0.64,-14.2,1.6+(19-1.6)/2,z))

part = board.union(relay).union(term).union(hdr)