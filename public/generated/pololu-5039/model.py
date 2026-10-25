pcb_t=1.6
z0=-6
zt=z0+pcb_t
W,L=65.0,51.3
# PCB: X centered, Y from 0..51.3, thickness along Z (-6..-4.4) per supplied boundsMm
part=cq.Workplane('XY').box(W,L,pcb_t,centered=(True,False,False)).translate((0,0,z0))
# mounting holes
holes=[(-29.2,23.6+L/2),(-21.6,-22.1+L/2)]
part=part.cut(cq.Workplane('XY').workplane(offset=z0).pushPoints(holes).circle(1.6).extrude(pcb_t))
# stackable headers (2.54 mm wide strips, ~8.5 mm tall)
hh=8.5
def strip(n,x0,y):
    return cq.Workplane('XY').box(n*2.54,2.54,hh,centered=False).translate((x0,y-1.27,zt))
for s in [strip(10,-30,3.0),strip(8,-3.5,3.0),strip(8,-26,L-3.0),strip(10,0.5,L-3.0)]:
    part=part.union(s)
# screw terminal blocks (6 positions, 5.08 mm pitch) up to Z=+6
th=6-zt
tb=cq.Workplane('XY').box(30.48,8.0,th,centered=False).translate((2.0,L-14.0,zt))
part=part.union(tb)
# electrolytic capacitors
caps=[(-8,29),(-1,26),(6,23),(12,19),(-1,15)]
cp=cq.Workplane('XY').workplane(offset=zt).pushPoints(caps).circle(4.0).extrude(9.5)
part=part.union(cp)