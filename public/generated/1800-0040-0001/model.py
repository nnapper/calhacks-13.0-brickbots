pts=[(x,y) for y in (16,-16) for x in list(range(-48,25,8))+[40,48]]
pts+=[(8,8),(16,8),(40,8),(48,8),(8,0),(8,-8),(16,-8),(24,-8),(48,-8)]
tap=[(-50,5),(-50,-5),(-2,5),(-2,-5)]
plate=cq.Workplane('XY').center(0,20).box(104,40,3)
holes=cq.Workplane('XY').workplane(offset=-2).pushPoints([(x,y+20) for x,y in pts+tap]).circle(2).extrude(4)
pocket=cq.Workplane('XY').workplane(offset=-2).center(-26,20).rect(42,21).extrude(4)
bore=cq.Workplane('XY').workplane(offset=-2).center(32,20).circle(7).extrude(4)
part=plate.cut(holes).cut(pocket).cut(bore)