body_h=10.2
tab_h=3.5
body=cq.Workplane('XY').box(20,body_h,6.4).translate((0,tab_h+body_h/2,0))
holes=cq.Workplane('XY').pushPoints([(-2.85,tab_h+2.9),(6.65,tab_h+2.9)]).circle(1.2).extrude(5,both=True)
body=body.cut(holes)
tabs=cq.Workplane('XY')
for x in (-2.85,1.9,6.65):
    tabs=tabs.union(cq.Workplane('XY').box(3.2,tab_h+0.5,0.5).translate((x,(tab_h+0.5)/2,0)))
top=tab_h+body_h
arm=cq.Workplane('XY').box(15.5,0.5,4.0).translate((1.25,top+0.25-0.25,0))
roller=cq.Workplane('XY').center(-6.5,top+2.3).circle(2.5).extrude(2.1,both=True)
part=body.union(tabs).union(arm).union(roller)