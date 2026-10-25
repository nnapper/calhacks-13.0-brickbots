pcb_t=1.6
pin_len=6.0
y_pcb=pin_len
L=68.6
W=53.3
# PCB (Y is up)
pcb=cq.Workplane('XY').box(L,pcb_t,W).translate((0,y_pcb+pcb_t/2,0))
# mounting holes (analysis x,y -> model x,z)
for (hx,hz) in [(-24,-12),(10,-19)]:
    pcb=pcb.cut(cq.Workplane('XY').add(cq.Solid.makeCylinder(1.6,pcb_t+2,cq.Vector(hx,y_pcb-1,hz),cq.Vector(0,1,0))))
part=pcb
y_top=y_pcb+pcb_t
# stackable headers along both long edges
hdr_h=12.0
for (cx,cz,n) in [(-5.0,-24.13,10),(0.0,24.13,10)]:
    body=cq.Workplane('XY').box(2.54*n,hdr_h,2.54).translate((cx,y_top+hdr_h/2,cz))
    part=part.union(body)
    for i in range(n):
        px=cx-2.54*(n-1)/2+2.54*i
        pin=cq.Workplane('XY').box(0.5,pin_len+1,0.5).translate((px,(pin_len+1)/2,cz))
        part=part.union(pin)
# four 2-position screw terminal blocks
tb_h=10.0
for i in range(4):
    x=-15.24+10.16*i
    blk=cq.Workplane('XY').box(10.16,tb_h,10.0).translate((x,y_top+tb_h/2,8.0))
    part=part.union(blk)
