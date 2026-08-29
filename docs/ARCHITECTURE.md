# Project Architecture & Developer Guide

This document outlines the architectural patterns, data flow, mathematical pipelines, and conventions used across **PSXModeller 3D**.

---

## 1. Directory Structure

```
src/
├── types/                 # Pure TypeScript interface definitions
│   ├── mesh.ts            # MeshObject, Vertex, Face, Edge, UV, Vector3D
│   ├── animation.ts       # Armature, Bone, BoneTrack, Keyframe, AnimationClip
│   ├── texture.ts         # Material, Palette, TextureMap
│   └── tools.ts           # AppMode, SelectMode, Tool settings
│
├── core/                  # Decoupled mathematical & rendering engines
│   ├── geometry/
│   │   ├── Primitives.ts  # Low-poly mesh generators (Cube, Plane, Cylinder, Cone, Sphere)
│   │   ├── Operations.ts  # Extrude, Inset, Subdivide, Merge, Flip Normals, Delete
│   │   └── Converters.ts  # Fast transformation to Three.js BufferGeometry
│   ├── shaders/
│   │   └── PSXShader.ts   # Screen-space vertex jitter, affine UV warp, Gouraud & Bayer dither
│   ├── painting/
│   │   └── PixelCanvas.ts # Pure 2D pixel buffer operations (Bresenham line, BFS bucket, Dither)
│   ├── animation/
│   │   └── Armature.ts    # Keyframe interpolation & hierarchical bone evaluation
│   └── export/
│       ├── GltfExport.ts  # glTF 2.0 / GLB binary exporter
│       ├── ObjExport.ts   # Wavefront OBJ + MTL exporter
│       └── SpriteSheet.ts # 3D-to-2D multi-angle sprite sheet generator
│
├── stores/                # Pinia reactive state stores
│   ├── projectStore.ts    # Mesh objects, texture buffers, active selection, operations
│   ├── toolStore.ts       # Active tools, colors, brush sizes, viewport flags
│   ├── animationStore.ts  # Timeline playback, frame counter, keyframes
│   └── historyStore.ts    # Undo/Redo command stack
│
├── components/            # Vue 3 DCC UI components
│   ├── layout/            # HeaderMenu, LeftToolbar, RightSidebar
│   ├── viewport/          # Viewport3D, ViewportNav
│   ├── uvpaint/           # PixelCanvas, PalettePicker
│   ├── animation/         # Timeline, DopeSheet
│   ├── outliner/          # OutlinerTree
│   ├── inspector/         # TransformProps, MaterialProps
│   └── modals/            # ExportModal, HotkeyModal
│
└── utils/                 # General math & color utilities
    ├── math.ts            # Vectors, normals, barycentric coords, snapping
    └── color.ts           # Hex/RGB conversions, Bayer matrix, color distance
```

---

## 2. Core Data Models

### Mesh Representation (`MeshObject`)
Meshes are represented as topological collections of vertices, faces (triangles or quads), and UV arrays.
- `Vertex`: contains `{ id, position: {x,y,z}, color, boneWeights }`.
- `Face`: contains `{ id, vertexIds: string[], uvs: UV[], normal, materialIndex }`.
- Polygons are converted on-the-fly into WebGL renderable `BufferGeometry` via `meshToThreeGeometry()` in `src/core/geometry/Converters.ts`.

### Texture & Pixel Canvas
- All texture manipulation happens in memory on an off-screen `HTMLCanvasElement` (`PixelBuffer` class).
- Three.js updates via `CanvasTexture` with `magFilter = THREE.NearestFilter` and `minFilter = THREE.NearestFilter`.

---

## 3. PSX Retro Shader Engine

The PSX shader (`src/core/shaders/PSXShader.ts`) achieves classic PlayStation 1 aesthetic via three key techniques:
1. **Vertex Jittering**:
   ```glsl
   vec2 grid = uResolution; // e.g. 320x240
   vec2 snapped = floor((clipPos.xy / clipPos.w) * grid + 0.5) / grid;
   clipPos.xy = snapped * clipPos.w;
   ```
2. **Affine Texture Warping**:
   Bypassing perspective interpolation in the fragment shader by multiplying UV coordinates by `clipPos.w` in vertex stage and dividing in fragment stage.
3. **Color Banding & Bayer Dithering**:
   Quantizing colors to RGB555 15-bit color space with a 4x4 Bayer threshold matrix.

---

## 4. Extensibility Guidelines

- **Adding a new Primitive**: Add a generator function in `src/core/geometry/Primitives.ts` returning a `MeshObject`, then register it in `projectStore.addPrimitive()` and `HeaderMenu.vue`.
- **Adding a new Mesh Operation**: Write a pure function in `src/core/geometry/Operations.ts` that accepts `MeshObject` and returns a cloned transformed `MeshObject`.
- **Adding an Exporter**: Add a new exporter file under `src/core/export/` and hook it into `ExportModal.vue`.
