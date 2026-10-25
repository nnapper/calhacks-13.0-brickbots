t=8.0
vert=cq.Workplane('XY').box(32,32,t,centered=(True,False,False)).translate((0,0,-16)).edges('|Z and >Y').chamfer(4)
horiz=cq.Workplane('XY').box(32,t,32,centered=(True,False,True)).edges('|Y and >Z').chamfer(4)
body=horiz.union(vert)
def pattern(cx,cy):
    big=[(cx,cy)]
    small=[(cx+10,cy),(cx-10,cy),(cx,cy+10),(cx,cy-10),(cx+7,cy+7),(cx-7,cy+7),(cx+7,cy-7),(cx-7,cy-7)]
    return big,small
# horizontal leg (holes along Y), pattern center X=0, Z=4
b,s=pattern(0,4)
cut_h=cq.Workplane('XZ').workplane(offset=1).pushPoints(b).circle(7).extrude(-12)
cut_h=cut_h.union(cq.Workplane('XZ').workplane(offset=1).pushPoints(s).circle(2.1).extrude(-12))
# vertical leg (holes along Z), pattern center X=0, Y=20
b,s=pattern(0,20)
cut_v=cq.Workplane('XY').workplane(offset=-17).pushPoints(b).circle(7).extrude(10)
cut_v=cut_v.union(cq.Workplane('XY').workplane(offset=-17).pushPoints(s).circle(2.1).extrude(10))
part=body.cut(cut_h).cut(cut_v)