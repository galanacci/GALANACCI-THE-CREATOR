"""Convert the labelled Rhino digital frame into a web-ready GLB.

The source is authored Z-up in millimetres. The output is Y-up in metres so it
matches Three.js and the original browser export.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import rhino3dm
import trimesh


EXPECTED_LAYERS = {
    "FRONT_GLASS",
    "BACK_GLASS",
    "SCREEN",
    "FRAME",
    "METAL_SCREWS",
}


def mesh_faces(mesh: rhino3dm.Mesh) -> np.ndarray:
    triangles: list[tuple[int, int, int]] = []
    for face in mesh.Faces:
        a, b, c, d = face
        triangles.append((a, b, c))
        if c != d:
            triangles.append((a, c, d))
    return np.asarray(triangles, dtype=np.int64)


def mesh_vertices(mesh: rhino3dm.Mesh) -> np.ndarray:
    vertices = np.asarray([[v.X, v.Z, -v.Y] for v in mesh.Vertices], dtype=np.float64)
    return vertices * 0.001


def convert(source: Path, destination: Path) -> None:
    model = rhino3dm.File3dm.Read(str(source))
    if model is None:
        raise RuntimeError(f"Could not read Rhino model: {source}")

    available_layers = {layer.Name for layer in model.Layers}
    missing = EXPECTED_LAYERS - available_layers
    if missing:
        raise RuntimeError(f"Missing required layer labels: {', '.join(sorted(missing))}")

    scene = trimesh.Scene()
    name_counts: dict[str, int] = {}

    for source_object in model.Objects:
        geometry = source_object.Geometry
        if not isinstance(geometry, rhino3dm.Mesh):
            continue

        layer_name = model.Layers[source_object.Attributes.LayerIndex].Name
        name_counts[layer_name] = name_counts.get(layer_name, 0) + 1
        suffix = name_counts[layer_name]
        node_name = layer_name if suffix == 1 else f"{layer_name}_{suffix}"

        converted = trimesh.Trimesh(
            vertices=mesh_vertices(geometry),
            faces=mesh_faces(geometry),
            process=False,
            validate=False,
        )
        converted.metadata["source_layer"] = layer_name
        scene.add_geometry(converted, node_name=node_name, geom_name=node_name)

    if not scene.geometry:
        raise RuntimeError("The Rhino model did not contain any mesh objects.")

    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(scene.export(file_type="glb"))
    print(f"Exported {len(scene.geometry)} labelled meshes to {destination}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    convert(args.source, args.destination)


if __name__ == "__main__":
    main()
