rows = {32:[-8,0,8], 24:[-16,-8,0,8,16], 16:[-24,-16,-8,8,16,24], 8:[-32,-24,-16,-8,8,24,32], 0:[-32,-24,24,32], -8:[-32,-24,-16,-8,8,24,32], -16:[-24,-16,-8,8,16,24], -24:[-16,-8,0,8,16], -32:[-8,0,8]}
pts = [(x, y + 48) for y, xs in rows.items() for x in xs]
ring = cq.Workplane('XY').workplane(offset=-16).center(0, 48).circle(48).circle(38).extrude(32)
plate = cq.Workplane('XY').workplane(offset=-8).center(0, 48).circle(38).extrude(8)
part = ring.union(plate)
bore = cq.Workplane('XY').workplane(offset=-8).center(0, 48).circle(7).extrude(8)
holes = cq.Workplane('XY').workplane(offset=-8).pushPoints(pts).circle(2).extrude(8)
part = part.cut(bore).cut(holes)