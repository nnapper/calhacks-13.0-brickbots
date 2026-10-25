L=403.1
x0=-L/2
x1=L/2
# gearbox housing at rear
gear=cq.Workplane('XY').box(62,75,60,centered=(False,False,True)).translate((x0,0,0))
# outer tube along X (retracted state)
tube=cq.Workplane('YZ').workplane(offset=x0+50).center(20,0).circle(20).extrude((x1-25)-(x0+50))
# rod end
rod=cq.Workplane('YZ').workplane(offset=x1-25).center(20,0).circle(12.5).extrude(25)
# motor parallel to tube, on top of gearbox
motor=cq.Workplane('YZ').workplane(offset=x0+50).center(52,0).circle(23).extrude(130)
part=gear.union(tube).union(rod).union(motor)
# 13 mm vertical cross holes
h1=cq.Workplane('XZ').workplane(offset=-80).center(x1-12.5,0).circle(6.5).extrude(80)
h2=cq.Workplane('XZ').workplane(offset=-80).center(x0+15,0).circle(6.5).extrude(80)
part=part.cut(h1).cut(h2)