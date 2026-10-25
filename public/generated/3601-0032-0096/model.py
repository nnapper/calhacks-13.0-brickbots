rows={32:[-8,0,8],24:[-16,-8,8,16],16:[-24,-16,16,24],8:[-32,32],0:[-32,32],-8:[-32,-24,24,32],-16:[-24,-16,16,24],-24:[-16,-8,8,16],-32:[-8,0,8]}
pts=[(x,y) for y,xs in rows.items() for x in xs]
ring=cq.Workplane('XY').workplane(offset=-16).circle(48).circle(38).extrude(32)
plate=cq.Workplane('XY').workplane(offset=-8).circle(38).circle(16).extrude(8)
holes=cq.Workplane('XY').workplane(offset=-8).pushPoints(pts).circle(2).extrude(8)
part=ring.union(plate).cut(holes).translate((0,48,0))