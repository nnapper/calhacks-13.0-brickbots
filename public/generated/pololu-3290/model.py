W=32.5
H=23.5
L=60
body=cq.Workplane('XY').box(W,H,L,centered=(True,False,True))
# cooling grooves across the top (run through the full width)
gd=4.0
gw=1.6
pitch=3.6
n=10
z0=-24
for i in range(n):
    z=z0+i*pitch
    cutter=cq.Workplane('XY').box(W+2,gd+1,gw,centered=(True,False,True)).translate((0,H-gd,z))
    body=body.cut(cutter)
# front-face USB port recess and 2x5 CTRL header recess (+Z end)
usb=cq.Workplane('XY').box(7.5,2.6,6,centered=(True,True,True)).translate((-9,6,L/2-1.5))
hdr=cq.Workplane('XY').box(10,4.5,6,centered=(True,True,True)).translate((5,6.5,L/2-1.5))
part=body.cut(usb).cut(hdr)