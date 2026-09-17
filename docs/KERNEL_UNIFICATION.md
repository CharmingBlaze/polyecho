# Kernel unification: foundation slice

This migration extends the existing `EditableMesh`, `MeshBridge`, `MeshValidator`, operators and project/history stores. It introduces neither a third mesh representation nor a new UI framework. Coordinates remain right-handed, Y-up, in meters; CCW polygon winding produces front/outward normals. Faces remain polygons until render/export triangulation.

## Implemented boundary

- A per-project `MeshRepository` holds resident kernels outside Vue reactivity. Modal sessions reuse them, preserving numeric IDs between sessions. Deleted objects are pruned on acquisition and the repository is cleared on store disposal.
- Legacy edits and history restores synchronize on acquisition. Surviving vertex/face IDs and edge IDs are preserved during this synchronization, with allocator high-water marks retained. Metadata and selection changes do not rebuild topology.
- Extrude and Inset menu commands stage an independent kernel snapshot, validate, record history before the resident/document mutation, publish, and update selection. Failed edits do not create history entries. Their algorithms remain the same kernels used by modal tools.
- Modal commit validation rejects invalid topology through the normal cancel path. Errors carry a code, reason and validation diagnostics; the status bar shows the reason. Loop Cut and Knife apply many face splits in one operation and validate once on confirm rather than snapshotting every split.
- Kernel snapshots and projection retain vertex/face document identity, vertex colors, bone weights, face-corner UVs, materials and edge seams. Edge sharp flags survive kernel snapshots, but are not yet serialized or exposed as a document action.
- `replaceFace` retains surviving edge identities and flags. Single and multiple edge splits propagate seams/sharp flags and interpolate normalized skin weights, capped at four influences. Extrusion and inset duplicate vertex attributes independently.
- `editMesh` provides atomic synchronous rollback on exceptions or invalid results, including allocator state. Successful results contain created/deleted IDs and topology/position/attribute change flags.
- An endpoint index avoids scanning every edge during edge construction and is rebuilt after snapshot restoration.
- `.psxproj` remains version `1.0`, app name `PSXModeller`. The serialized document shape has not changed.

## Remaining migration

This slice is not full kernel authority. The document still contains editable arrays, and remaining one-shot operations, gizmo/UV/rigging writes, modifiers, rendering and export still use those compatibility projections. Their migration must remove dual ownership rather than silently cache stale document data.

Next, route all mutation paths through resident transactions; make render/pick/snap consumers use a shared adapter; replace broad revisions with per-object topology/position/attribute revisions; and capture resident topology in history so deleted/recreated edge and corner identity survives undo/redo exactly. Current JSON history retains document identities, but does not persist numeric edge/corner identity or loose edges.

Do not expose persistent sharp/crease attributes or loose-edge creation until the project format has an explicit version bump and migration. Complete attribute propagation through bevel, merge, subdivision, face-interior knife cuts and modifier evaluation before claiming those operations preserve every attribute. Generic corner/custom attributes, accelerated queries and the later product phases remain planned work.

The resident compatibility signature is linear in mesh size on acquisition. It is a correctness guard during migration, not the final revision-based cache strategy. Preview document projections also remain an interim rendering path.

The ordered execution plan for the work above — the resident-commit write contract, the verified list of mutation paths that still bypass the kernel, the per-object revision scheme, history topology capture, and the attribute-propagation matrix — lives in `docs/ARCHITECTURE_IMPROVEMENT_PLAN.md`.

## Verification

`MeshResidency.test.ts` covers map-free identity, deep attribute isolation, split seam propagation, stable adjacent edges, extrusion, resident reuse and failed import rejection. `stores/meshResidency.test.ts` covers resident Extrude, rejected edits without history, cancel, undo/redo and 1.0 project parsing. Existing topology, rendering, operator, modifier, rigging and project tests remain required.
