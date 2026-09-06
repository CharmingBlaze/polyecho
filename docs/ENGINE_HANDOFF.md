# Engine hand-off

Export **File → Export GLB**. PolyEcho does not install Godot, Unity, or Blender for you. After export, open the file in the engine and check the list below.

A ready-made character GLB (same fixture as the unit test) is `samples/engine-handoff.glb`. Regenerate it with `npm run handoff:glb`. CI runs the Khronos `gltf-validator` on that export (0 errors). Godot / Unity / Blender are still a visual check on your machine.

## What the GLB is supposed to contain

- Unique node names (duplicate bone/mesh names get `_2`, `_3`, …).
- Mesh UVs as `TEXCOORD_0`.
- A `skins` entry when the scene has an armature.
- Named `MeshStandardMaterial`s. Painted textures embed as real 8-bit RGBA PNGs (`encodePngRgba` / `embedPngImages`), not `canvas.toDataURL()` (the test stub’s data URL is not a PNG).
- One glTF animation per clip, by clip name.
- Timeline markers as `animations[i].extras.events` (`name`, `frame`, `time`). Three.js does not write clip `userData`; PolyEcho patches the GLB JSON after export.

## Hand-check (character)

1. Mesh with UVs, one painted texture, two bones, clips **Walk** + **Idle**, a marker on Walk.
2. Godot 4: Import the GLB. Confirm mesh, skeleton, both animations, and albedo. Markers need a custom importer or `extras` reader.
3. Unity: Import the GLB (or FBX via a DCC if you prefer). Confirm Humanoid is **not** assumed — this is a generic skeleton.
4. Blender: File → Import → glTF. Confirm rest pose, weights, and both actions.

## Still not claimed

Humanoid retarget maps, Godot `.tres` materials, Unity prefabs, and a CI job that boots those engines.
