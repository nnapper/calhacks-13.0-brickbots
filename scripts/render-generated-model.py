"""Render a constrained CadQuery program to STEP and GLB.

The generated program is data, not trusted code. It receives a pre-imported
``cq`` object and may not perform imports, I/O, reflection, or export itself.
"""
from __future__ import annotations

import argparse
import ast
import hashlib
import json
import math
from pathlib import Path

import cadquery as cq
import trimesh


FORBIDDEN_CALLS = {
    "open", "eval", "exec", "compile", "globals", "locals", "vars", "dir",
    "getattr", "setattr", "delattr", "input", "breakpoint", "__import__",
}
FORBIDDEN_ATTRIBUTES = {"exporters", "importers", "occ_impl"}


def validate_code(source: str) -> None:
    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        raise ValueError(f"Generated CadQuery is not valid Python: {exc}") from exc

    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom, ast.Global, ast.Nonlocal)):
            raise ValueError("Generated CadQuery may not import modules or declare globals")
        if isinstance(node, ast.Name) and (node.id in FORBIDDEN_CALLS or node.id.startswith("_")):
            raise ValueError(f"Generated CadQuery uses forbidden name: {node.id}")
        if isinstance(node, ast.Attribute) and (node.attr in FORBIDDEN_ATTRIBUTES or node.attr.startswith("_")):
            raise ValueError(f"Generated CadQuery uses forbidden attribute: {node.attr}")
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in FORBIDDEN_CALLS:
            raise ValueError(f"Generated CadQuery calls forbidden function: {node.func.id}")


def shape_from(part: object) -> cq.Shape:
    value = part.val() if isinstance(part, cq.Workplane) else part
    if not isinstance(value, cq.Shape):
        raise ValueError("Generated CadQuery must assign a Workplane or CadQuery shape to `part`")
    if not value.isValid():
        raise ValueError("Generated CadQuery produced an invalid shape")
    return value


def check_bounds(bounds: dict[str, float], expected: list[float] | None) -> list[str]:
    measured = sorted(value for value in [bounds["xlen"], bounds["ylen"], bounds["zlen"]] if value > 0)
    warnings: list[str] = []
    if not expected:
        return warnings

    for dimension in expected:
        if dimension <= 0:
            continue
        if not any(abs(dimension - value) / dimension <= .08 for value in measured):
            warnings.append(
                f"Generated geometry is missing a listed dimension {dimension:.3f} mm; "
                f"measured dimensions are {measured}"
            )
    if max(measured) > max(expected) * 1.2:
        warnings.append("Generated part is larger than the largest listed dimension.")
    return warnings


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--code", required=True)
    parser.add_argument("--request", required=True)
    parser.add_argument("--step", required=True)
    parser.add_argument("--stl", required=True)
    parser.add_argument("--glb", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()

    code_path = Path(args.code)
    request = json.loads(Path(args.request).read_text())
    validate_code(code_path.read_text())

    environment: dict[str, object] = {"cq": cq, "math": math, "pi": math.pi}
    try:
        exec(compile(code_path.read_text(), str(code_path), "exec"), environment, environment)  # noqa: S102
    except Exception as exc:
        raise ValueError(f"Generated CadQuery failed to execute: {exc}") from exc

    part = environment.get("part", environment.get("result"))
    if part is None:
        raise ValueError("Generated CadQuery must assign `part`")

    shape = shape_from(part)
    box = shape.BoundingBox()
    bounds = {name: getattr(box, name) for name in ["xmin", "xmax", "ymin", "ymax", "zmin", "zmax", "xlen", "ylen", "zlen"]}
    if not all(math.isfinite(value) for value in bounds.values()):
        raise ValueError("Generated CadQuery produced non-finite bounds")
    warnings = check_bounds(bounds, request.get("expectedDimensionsMm") or [])

    workplane = part if isinstance(part, cq.Workplane) else cq.Workplane(obj=shape)
    cq.exporters.export(workplane, args.step, tolerance=.02, angularTolerance=.15)
    cq.exporters.export(workplane, args.stl, tolerance=.02, angularTolerance=.15)
    mesh = trimesh.load(args.stl, force="mesh")
    if not len(mesh.faces):
        raise ValueError("Generated mesh contains no triangles")
    mesh.apply_scale(.001)
    Path(args.glb).write_bytes(trimesh.exchange.gltf.export_glb(mesh))

    paths = [Path(args.step), Path(args.stl), Path(args.glb)]
    report = {
        "engine": "CadQuery 2.8.0 + OpenCascade 7.9",
        "boundsMm": bounds,
        "warnings": warnings,
        "files": {path.name: {"bytes": path.stat().st_size, "sha256": sha256(path)} for path in paths},
    }
    Path(args.report).write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
