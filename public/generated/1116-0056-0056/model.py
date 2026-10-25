part = (cq.Workplane("XZ")
        .rect(56, 56).extrude(-2.5)
        .faces(">Y").workplane(centerOption="CenterOfBoundBox")
        .rarray(8, 8, 7, 7).hole(4))