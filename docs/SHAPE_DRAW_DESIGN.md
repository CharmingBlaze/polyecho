# Shape Draw — sketch any kind of 3D form

Original design notes. The shipped tool, limits, and persistence contract are in [SHAPE_DRAW.md](SHAPE_DRAW.md).

Based on the attached brief, visual references, and the current PolyEcho source. The human meshes illustrate silhouette clarity and deliberate polygon placement; anatomy is not a requirement or an assumption of the system.

## 1. Concept and scope

**Shape Draw** is an additional Blockout tool: **Draw → Give volume → Refine → Make editable**. Keep the existing workspace, Poly Draw, Poly Build, references, and three-pane layout. Give Shape Draw its own toolbar entry and command-palette action without replacing F or V.

Use three starting gestures within the same tool:

| Start with | Best suited to | Example |
| --- | --- | --- |
| Outline | Broad silhouettes and plates | Rock, leaf, shield, vehicle body, facade |
| Path | Long forms with changing thickness | Branch, pipe, tail, horn, cable, limb |
| Sections | Forms needing deliberate volume and edge flow | Hull, furniture leg, torso, architectural moulding |

These are geometric choices, not categories of objects. A chair can combine a seat outline and leg paths. A creature can combine a body loft and horns. Multiple pieces remain separate by default; touching forms do not silently fuse.

One silhouette supplies an outline, not a uniquely determined 3D object. The tool proposes volume and gives the user simple ways to correct it. It should never promise automatic reconstruction or animation-ready anatomy from a drawing.

## 2. Ideal workflow

1. Activate Shape Draw. A compact panel appears near the active pane edge.
2. Choose Outline, Path, or Sections; Outline is the default.
3. Draw freely or use an existing reference. The first point locks the drawing plane; a visible plane label prevents accidental changes while orbiting.
4. Close an outline. A shallow preview appears immediately, with one prominent depth handle. Open paths instead show radius handles.
5. Pull the handle for volume. Choose a form preset if useful; orbit in Perspective while editing in Front or Side.
6. Drag outline points, add local thickness handles, or add a section wherever the volume needs guidance.
7. Press Enter to finish the gesture or leave editing, retaining a procedural Shape object. Double-click that object to return.
8. Choose **Make Editable Mesh** only when ready for ordinary component modelling.

Example: trace a spaceship body, pull depth, add a narrower rear section, then draw separate wing outlines. No character-specific steps or templates are involved.

## 3. Floating panel

Target approximately 280 px wide, with only the current stage expanded. Reuse the existing floating drag composable. Provide a drag header, collapse button, close button, and optional edge docking; constrain its position after window and pane resizing.

| Stage | Visible controls |
| --- | --- |
| Draw | Outline / Path / Sections; Points / Freehand; Corner / Smooth; Close loop; symmetry; snap |
| Form | Form preset; Depth or Radius; Roundness; Taper; Add thickness point; Add section |
| Detail, collapsed initially | Density; preserve corners; front/back bias; bevel; flat/smooth shading; mesh counts |
| Footer | Context hint; Done; Make Editable Mesh |

Reference controls open the existing References UI rather than duplicating it. Offer opacity and visibility as compact shortcuts for the selected reference. Existing reference data already covers scale, position, flip, visibility, locking, and front/side/top planes. Arbitrary oriented reference planes require a schema and rendering extension. Do not repurpose the current Perspective image-drop behavior, which applies a texture.

Closing the panel ends the current gesture and retains accepted shapes. Esc cancels an active gesture; Esc again exits the tool. Minimize never deletes work. Show explicit completion and cancellation controls for accessibility.

## 4. Viewport interaction

- Click adds a corner. Drag from a newly placed point creates curve tangents. Freehand captures a stroke, then simplifies it while preserving marked corners.
- Click the first point closes an outline. Open outlines remain drawings; they do not receive an arbitrary closing edge without an explicit action.
- Drag a point to edit. Double-click a segment inserts a point; Delete removes selected points. Corner/smooth changes are local and reversible.
- Shift constrains directions using existing drawing conventions. Grid snapping follows Blockout settings. Display the winning snap target.
- Middle-mouse navigation and wheel zoom retain existing behavior. Wheel changes radius only when explicitly interacting with a radius handle. Reference gestures remain available for unlocked references.
- Tab switches Draw/Form while Shape Draw owns focus. Enter accepts the current gesture, not conversion. Text fields consume their own keys.
- Double-clicking a procedural object reopens its recipe; it must not conflict with double-clicking a segment during curve editing.

Route events through the existing operator priority model. Resolve handles, control points, generated shape, then empty drawing plane in that order. All hit testing uses the active pane's camera and rectangle, including resized and maximized panes.

## 5. Multiple views and sections

**Front plus Side:** preserve Front as the primary outline. Side contributes depth intervals at corresponding heights, using a shared origin and scale. Offer alignment landmarks and an overlay of the implied cross-section. This is a constrained interpretation of two views, not reconstruction of hidden concavities.

When a scanline intersects multiple disconnected regions, require the user to associate parts or split the shape. Do not join legs, branches, or window openings through an ambiguous match. Contradictory profiles show the affected region and retain the last valid preview.

**Sections:** place a plane along an axis or path and draw a closed profile. Match winding, seam landmark, and boundary samples between adjacent sections, then bridge them. Preserve marked corners during resampling. Interpolate without overshoot by default. Display a seam marker and twist handle because automatic correspondence can rotate a square into a diamond unexpectedly.

Initially require the same contour/hole structure across a loft. Branching or changing hole count is an explicit split/join operation, not a hidden interpolation rule. A top view can add another constraint later; an arbitrary perspective photograph is a visual reference unless calibrated.

## 6. Volume modes

Separate **form** from **density**. Low Poly is a density choice available with every form; otherwise users cannot make both an organic and low-poly asset.

| Form | Geometric behavior |
| --- | --- |
| Flat | Constant-depth shell, capped and optionally bevelled |
| Rounded | Controlled rim and rounded cross-section with a fuller centre |
| Inflated | Thickness grows from the boundary toward the interior, controlled by local handles |
| Blocky | Few profile bands and deliberate planar transitions |
| Organic | Smoother thickness interpolation and softer transitions |
| Hard Surface | Pinned corners, planar regions, restrained bevels, explicit sharp edges |

Presets set understandable parameters and remain editable. Show overrides as Custom. A shading change alone must never be presented as a change in geometric roundness.

For inflated outlines, triangulate the interior with added interior samples and solve a smooth, boundary-constrained thickness field. Construct front/back surfaces around the drawing plane, with separate curvature bias and a valid rim. Local thickness pins constrain that field. A simple distance-to-boundary field is a useful starting approximation but needs smoothing to avoid internal ridges.

Rounded forms can use offset bands near the boundary, but concave offsets can split or collapse. Use a robust offset strategy and explicit fallback to triangulated patches; never scale every contour point toward the centroid. Polygon offsetting and straight-skeleton methods provide relevant foundations: [CGAL overview](https://doc.cgal.org/latest/Straight_skeleton_2/index.html). This is an algorithm reference, not a dependency decision.

## 7. Direct manipulation

Use a depth arrow normal to the drawing plane, paired front/back grips for asymmetric volume, radius rings along paths, and draggable section planes. Keep handle sizes constant in screen pixels.

Dragging a generated surface in Form mode creates or adjusts a local thickness pin with a visible influence region. It edits the recipe rather than an arbitrary output vertex. Show only selected and nearby handles. Provide numeric entry for precise adjustments and a visible axis indicator when a handle is nearly edge-on.

Symmetry refers to labelled object-local X/Y/Z planes with a movable origin. Generate mirrored geometry from one source and weld compatible centre boundaries once. Keep drawing-plane symmetry and existing mesh mirror modifiers from applying the same reflection twice.

## 8. Non-destructive representation

The recipe is authoritative; geometry is a derived cache. Retain original freehand samples, fitted curves, corner flags, sections, parameters, transforms, and generation version. Simplification changes sampling without destroying the source stroke.

Object transforms and materials remain usable while procedural. Component editing requests conversion, since regenerated vertex identities cannot generally preserve arbitrary cuts, UV edits, or weights. Do not silently remesh a rigged or painted result.

Save accepted recipe edits with the project and autosave. A cached evaluated mesh provides a fallback if a future generator cannot load an older recipe. Unsupported recipes must not be silently discarded.

## 9. Clean conversion

Make Editable Mesh runs final-quality generation and validation, then writes normal vertices, triangle/quad faces, per-corner UVs, material assignments, and shading through the existing mesh bridge. Preserve object identity, hierarchy, and transforms where possible; clear invalid component selections.

Conversion is one undoable transaction. Undo restores the procedural source; redo restores the exact baked output. Optionally Keep Source creates a separate hidden source object, with no live overwrite link to the edited mesh.

Assign predictable starter UVs: planar cap UVs and perimeter/length-based side UVs, or path-length/section-perimeter coordinates for sweeps. These are usable starting points, not a promise of packed, distortion-free UVs.

## 10. Topology strategy

Use specialized generators behind one interface:

1. Flat/hard-surface outlines: validated boundaries and holes, quality-aware cap triangulation, quad side bands, optional bevel bands.
2. Rounded/inflated outlines: constrained interior sampling and thickness surfaces; optimize poorly shaped triangles while pinning the silhouette and important corners.
3. Paths/sections: corresponding rings with quad strips, triangulated caps, and explicit seams. Transport path frames consistently to prevent sudden twisting.

Three.js exposes contour-with-holes triangulation through [ShapeUtils](https://threejs.org/docs/pages/ShapeUtils.html). It is a cap-building primitive, not a complete topology or inflation solution. Validate against the project's installed Three.js version before adopting APIs.

Merge triangle pairs only when the resulting quad is convex and sufficiently planar. Never advertise universal all-quad output. The reference humans' joint loops require deliberate section placement or later topology work; a silhouette-only inflation cannot infer those loops reliably.

Check winding, normals, scale-relative degeneracy, boundary closure, non-manifold edges and vertices, duplicate faces, and self-intersections. The existing MeshValidator covers some structural checks, but must be extended for the full generation contract. Density is an approximate budget; report when pinned details prevent reaching it.

## 11. Vue + Three.js integration

Proposed additions, using the current architecture:

| Module | Responsibility |
| --- | --- |
| `ShapeDrawPanel.vue` | Contextual controls; reuse `useFloatingDrag` |
| `shapeDrawStore.ts` | Active editing session and UI state |
| `ShapeDrawOperator.ts` | Pointer/key routing and gesture lifecycle |
| `core/shapeDraw/recipe.ts` | Versioned document types and validation |
| `core/shapeDraw/generators/` | Pure outline, inflation, sweep, loft algorithms |
| `core/shapeDraw/generation.worker.ts` | Background evaluation and cancellation |
| `ShapeDrawPreview.ts` | Preview buffers, guides, handle picking, disposal |
| `ShapeDrawCommit.ts` | MeshBridge conversion and history transaction |

Keep heavy geometry outside deep Vue reactivity. Viewport3D wires overlays and pane context; avoid putting generation algorithms into that component. The existing ModalOperator assumes an EditableMesh snapshot, so add an explicit recipe-editing adapter or lifecycle extension instead of pretending a recipe is already a component-editable mesh.

## 12. Data contract

Suggested fields, to formalize before implementation:

```ts
type ShapeRecipe = {
  schemaVersion: 1
  generatorVersion: string
  kind: 'outline' | 'path' | 'loft'
  profiles: Profile[]
  path?: PathGraph
  parameters: FormParameters
  thicknessPins: ThicknessPin[]
  symmetry: SymmetrySettings
  referenceIds: string[]
}
```

- **Profile:** stable ID; plane origin and orthonormal basis; section position; loops; seam landmark; optional reference association.
- **Loop:** stable ID; outer/hole role and parent contour; closed state; ordered curve points; optional raw stroke.
- **Curve point:** stable ID; 2D position; optional in/out tangents; corner/smooth mode; pin flag.
- **PathGraph:** nodes with 3D position and elliptical radii; edges with curve controls, taper, and section references; explicit branch connections.
- **FormParameters:** preset; depth; roundness; inflation; taper; bevel; front/back bias; density target; corner tolerance; shading.
- **ThicknessPin:** profile-local location; front/back thickness; influence radius.
- **Generated cache:** indexed positions; logical triangle/quad faces; per-corner UVs; sharp-edge tags; bounds; recipe revision; diagnostics; optional source-to-face mapping.

A backward-compatible optional `shapeSource` field on MeshObject is a plausible integration: ordinary mesh arrays hold the last valid evaluation, while Shape Draw owns regeneration. Audit snapshot cloning, serializer, storage, duplication, deletion, exports, and component-tool gates. Preserve the repository's fixed project-format version; version the additive recipe separately and test round trips.

## 13. Undo and redo

One drag or slider gesture is one history action, not one action per frame. Capture before/after recipes; cache deterministic evaluated outputs where necessary. Restore selection with the action.

Current global undo is disabled during modal operators. Shape Draw therefore needs explicit local gesture undo/redo while an edit session is active. Done publishes the session as a global history transaction; cancel discards it. Accepted session changes must participate in dirty tracking and recovery rather than living only in transient UI state. Delayed worker replies must be invalidated after undo, cancel, deletion, or project replacement.

## 14. Performance

Keep control-point movement immediate. Coalesce generation requests per animation frame; use a reduced preview during a drag and refine after release. Aim for sub-100 ms coarse feedback on representative low-poly assets, measured on target hardware rather than assumed.

Cache sampled boundaries and connectivity when only thickness changes. Rebuild topology for density, corner, or contour changes. Use worker request IDs and recipe revisions so stale results cannot replace newer geometry. Transfer typed arrays, bound caches, and dispose replaced GPU buffers. Three.js [BufferGeometry](https://threejs.org/docs/pages/BufferGeometry.html) provides the render representation; maintain logical quads separately for editing.

Set explicit sample/face ceilings and offer a lower preview density when needed. Benchmark concave shapes, long freehand strokes, holes, and multiple objects as well as simple circles.

## 15. Failure behavior and acceptance cases

Reject crossed, duplicate, collapsed, or touching-hole contours with a highlighted location and an actionable hint. Preserve the drawing and last valid mesh. Handle tiny scales, negative transforms, narrow necks, excessive bevels, twisted lofts, cusp paths, unsupported branches, and overlapping parts explicitly. Missing reference images must not prevent editing the stored shape.

Require a regression gallery spanning a concave wrench, shield with a hole, leaf, rock, chair, branching tree, pipe elbow, vehicle hull, and separated creature limbs. Check silhouette preservation, finite coordinates, manifold closure for solid outputs, deterministic regeneration, all pane interactions, save/load, and cancellation during worker activity.

## 16. Signature improvements and delivery order

The strongest additions are local thickness pins, automatic suggestions for where a section would help, persistent corner pins, and a silhouette-overlay toggle. Keep suggestions dismissible and geometry-focused. A small shape shelf can store any reusable recipe without imposing categories.

The proposed skeleton workflow should be called **Path**: it describes geometry rather than animation bones. Start with unbranched sweeps. Connected branches require actual junction meshing; overlapping tubes are not a welded volume. Later, an explicit Fuse operation can use a volumetric union and remeshing, clearly showing that it changes topology and may lose sharp detail.

Deliver in gates: first prove generic outline editing, flat and rounded/inflated generation, live depth, persistence, undo, and clean conversion across the gallery. Then add path sweeps and section lofts. Finally add paired-view constraints and branch fusion once their ambiguous cases behave predictably. The rounded/inflated gate must produce real volume; flat extrusion alone does not fulfill the concept.

Success means a user can draw a recognizable object, shape its hidden volume with a few gestures, leave and return to the drawing, and convert it into trustworthy editable geometry—all inside the Blockout workspace they already like.
