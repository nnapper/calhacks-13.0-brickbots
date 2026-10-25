def bx(x0,x1,y0,y1,z0,z1):
    return cq.Workplane('XY').box(x1-x0,y1-y0,z1-z0,centered=False).translate((x0,y0,z0))

# PCB (plan in X-Z, Y up), 1.6 mm thick
pcb = bx(-18.5,17.0,0,1.6,-15,15)
hole = cq.Workplane('XZ').center(-14.5,-11.5).circle(1.25).extrude(5,both=True)
pcb = pcb.cut(hole)

# 12-pin header along the left edge
hx = -16.8
hdr = bx(hx-1.27,hx+1.27,1.6,4.1,-15.24,15.24)
for i in range(12):
    z = (i-5.5)*2.54
    hdr = hdr.union(bx(hx-0.32,hx+0.32,0,14,z-0.32,z+0.32))

# 6-position screw terminal block along the right edge
term = bx(11.0,18.5,1.6,11.0,-10.5,10.5)

# electrolytic capacitor
cap = cq.Workplane('XZ').center(-4,0).circle(3.25).extrude(-6.0).translate((0,1.6,0))

# micro-USB connector on the back edge
usb = bx(-3.75,3.75,1.6,4.2,-15.5,-9.9)

part = pcb.union(hdr).union(term).union(cap).union(usb)