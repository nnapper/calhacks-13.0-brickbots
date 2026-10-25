tw=20
y0=20
ring=(cq.Workplane('XZ',origin=(0,y0,0)).slot2D(180,60).extrude(-tw)
    .cut(cq.Workplane('XZ',origin=(0,y0,0)).slot2D(174,54).extrude(-tw)))
part=ring
for x in (-60,60):
    wheel=cq.Workplane('XZ',origin=(x,y0+2,0)).circle(27.5).extrude(-(tw-4))
    axle=cq.Workplane('XZ',origin=(x,0,0)).circle(1.5).extrude(-60)
    part=part.union(wheel).union(axle)
