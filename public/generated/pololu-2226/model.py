d=14.5
L=50
# cells axis along Z; X along the 4-cell row; Y is stack thickness (bottom at Y=0)
row1=[(-1.5*d+i*d, d/2) for i in range(4)]
row2=[(-d+i*d, d/2+d*math.sin(math.pi/3)) for i in range(3)]
pts=row1+row2
part=None
for x,y in pts:
    c=cq.Workplane('XY').workplane(offset=-L/2).center(x,y).circle(d/2).extrude(L)
    part=c if part is None else part.union(c)
# fill the gaps between the cells with a hull-like block so the pack reads as one shrink-wrapped body
fill=(cq.Workplane('XY').workplane(offset=-L/2)
      .polyline([(-1.5*d,d/2),(1.5*d,d/2),(d,d/2+d*math.sin(math.pi/3)),(-d,d/2+d*math.sin(math.pi/3))]).close().extrude(L))
part=part.union(fill)