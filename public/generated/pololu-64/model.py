r_out = 25.0
w = 30.0
r_rim = 17.0
hub_w = 26.0
cy = 25.0

tire = (cq.Workplane('YZ').workplane(offset=-w/2).center(cy, 0)
        .circle(r_out).circle(r_rim).extrude(w))
hub = (cq.Workplane('YZ').workplane(offset=-hub_w/2).center(cy, 0)
       .circle(r_rim).extrude(hub_w))
part = tire.union(hub)