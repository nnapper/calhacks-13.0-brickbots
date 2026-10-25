L,W,H=56.0,27.0,12.0
hx=-14.0
def pl(x,y,z,n):
    return cq.Plane(origin=(x,y,z),xDir=(1,0,0),normal=n)
body=cq.Workplane('XY').box(L,H,W,centered=(True,False,True))
# hub-shaft rising 8mm from the face
boss=cq.Workplane(pl(hx,H,0,(0,1,0))).circle(7).extrude(8)
flange=cq.Workplane(pl(hx,H+5,0,(0,1,0))).circle(10).extrude(3)
body=body.union(boss).union(flange)
# servo spline clearance window
win=cq.Workplane(pl(-hx,-1,0,(0,1,0))).circle(8).extrude(H+2)
body=body.cut(win)
# face tapped holes, 16mm square pattern around hub
for dx in (-8,8):
    for dz in (-8,8):
        h=cq.Workplane(pl(hx+dx,H-8,dz,(0,1,0))).circle(1.7).extrude(8.01)
        body=body.cut(h)
# side tapped holes on both long faces
for x in (-20,0):
    h1=cq.Workplane(pl(x,H/2,W/2,(0,0,-1))).circle(1.7).extrude(8)
    h2=cq.Workplane(pl(x,H/2,-W/2,(0,0,1))).circle(1.7).extrude(8)
    body=body.cut(h1).cut(h2)
part=body