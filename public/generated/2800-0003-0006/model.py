head = cq.Workplane('YZ').workplane(offset=-4.5).center(2.75, 0).circle(2.75).extrude(3)
shank = cq.Workplane('YZ').workplane(offset=-1.5).center(2.75, 0).circle(1.5).extrude(6)
socket = cq.Workplane('YZ').workplane(offset=-4.5).center(2.75, 0).polygon(6, 2.5 / math.cos(math.pi / 6)).extrude(1.5)
part = head.union(shank).cut(socket)