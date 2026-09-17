# Rigging workspace

The right inspector provides four named steps, in both focused and split layouts.
The existing dark theme and amber accent are retained. Users may jump between steps;
the workflow does not force a wizard or remove existing expert tools.

1. **Skeleton:** select a model, add a fitted Human, Four-legged, Bird, Fish,
   Flexible chain or Single joint skeleton, or draw custom bones. Move joints in
   front and side views before binding. Starter templates add bones without
   replacing existing skeletons or animation clips. One undo removes one preset.
   Hierarchy, mirroring, sockets, and per-joint rest/IK/spring settings remain available.
2. **Attach:** automatic proximity weights for flexible surfaces; a single-bone
   attachment for rigid parts. Operations affect the named model. Repeat for other
   parts. Recalculating replaces its weights and rigid attachment; attaching a solid
   part clears vertex weights to avoid applying both deformations. Both are undoable.
   Selected-face/vertex/edge binding, split boundaries and unbinding are under Advanced.
3. **Weights:** select a bone and Paint to inspect its heatmap. Labeled tools expose
   Draw, Subtract, Smooth, Fill brush and Sample weight. Select verts enables vertex
   selection for numeric assignment. Brush falloff, local X mirror, normalization,
   and mesh utilities remain available. Rigid parts must switch to flexible binding
   before painting affects their deformation.
4. **Test:** search/select bones and rotate them temporarily with X/Y/Z sliders or
   the viewport. Binding checks report unweighted vertices, invalid weights and
   broken bone parents/lengths. Reset or leaving the step restores the rest pose;
   these controls do not create keyframes. Open Animation enters the existing editor.

## Implementation

- `RiggingWorkspace.vue` coordinates the existing tools through stores. Inspector
  tab names are retained for compatibility with existing commands.
- `RiggingWorkflow.ts` supplies templates, mesh rest transforms and read-only checks.
- Preset creation is a single history transaction in `animationStore`.
- Automatic weights, paint hit distances, full geometry construction and fast
  deformation updates use the mesh's rotation, scale and translation consistently.
- Paint, bone drawing and test pose are mutually exclusive through mode actions.
- Weight normalization removes invalid/missing bone references and limits vertices
  to four influences. Rigidity is resolved through existing bone-parent semantics.

## Limits

Templates fit a world-aligned bounding box; they do not recognize anatomy or fit
individual limbs. Humans assume arms out, animals/birds/fish face +Z, and chains
extend along Y. Unusual proportions and orientations need manual joint edits.
Distance blend uses bone proximity. Surface smoothing diffuses nearest-bone seeds along mesh edges; it is not a volumetric heat-diffusion solver: overlapping
surfaces and close limbs often need painting. Checks validate binding data rather
than judging animation quality. They describe the selected model, not every mesh.
Existing mesh-parent/socket transform conventions and local-X mirror behavior are
unchanged. Arbitrary nested scene-transform support is not added by this workflow.

Reference: [GLB Animator](https://jonasz-o.itch.io/glb-animator) inspired the accessible
template → automatic weights → heatmap → pose-preview sequence. No external code or
assets were copied.

## Verification

`RiggingWorkflow.test.ts` covers template hierarchy, additive creation with undo/redo,
binding metadata, diagnostics, exclusive modes, and transformed-model painting and
deformation. Existing skinning and GLB handoff tests cover compatibility. Browser
checks exercise fitting a chain, automatic attachment, rotating a test joint and
returning to weight refinement without recording keys.

## Guided fitting popup and bone display

Open **Rigging → Skeleton → Open guided rig fitting**. The draggable popup keeps
viewport access available. Add a starter skeleton if needed, choose each joint,
and use Front/Side to position it. Placement intersects a camera-facing plane
through the existing pivot, preserving view depth. It is manual landmark fitting,
not automatic anatomical detection or snapping to the skin surface.

Coincident endpoints on directly connected bones move with the fitted pivot.
Optional left/right mirroring matches `.L`/`.R` or `_L`/`_R` names around the rig
root's X position. Joint placement is undoable. The human starter now has 19 bones,
including chest, neck, shoulders and hands; individual finger bones are not generated.
Calculate weights targets the named model. Test deformation closes the popup and
opens the temporary pose checks.

Surface smoothing is the default in the workspace. It starts with nearest-bone
seeds and performs 12 adjacency smoothing passes, keeping four normalized influences.
Disconnected pieces do not exchange weights. Very coarse meshes, duplicated seam
vertices, unusual anatomy and poorly fitted joints may need Distance blend or
manual painting. This has not been benchmarked as equal to or better than Mixamo.

Bones use faceted shading, subdued left/right colors, an amber selection, and
proportional head/tip markers. Bone shafts are pickable. Skeleton → Display exposes
bone size and x-ray controls. These display settings do not change exported bones.

Additional tests cover offset symmetry, connected endpoints, placement undo,
exclusive modes, disconnected surfaces and normalized connected blends. Browser
checks cover opening the popup, adding a human rig, placing mirrored elbows,
calculating weights and handing off to Test deformation.
## Humanoid auto-rigger wizard

Skeleton → Humanoid auto-rigger opens a large modal with an independent shaded
model preview, seven color-coded landmark groups, and Choose model → Place markers
→ Review rig stages. T/A-pose suggestions fit world-space bounds; users confirm
chin, shoulders, elbows, wrists, pelvis, knees and ankles. Drag or arrow-nudge
markers in Front and Side views, optionally mirroring about the pelvis centerline.
The model must be upright (Y up), facing +Z. Suggestions are not anatomical detection.
Standard generates 19 bones; Simple generates 15. Neither generates fingers.

Review calculates weights on a draft and supports temporary joint bends with a
visible colored skeleton. Apply assigns fresh IDs, preserves existing bones/clips,
and replaces only the selected model's binding and weights in one undo step.
Cancel discards the draft. Geometry changes since opening reject a stale commit.
Original materials, textures and mesh transforms are preserved. Custom rig fitting
and non-humanoid templates remain available outside the wizard.

HumanoidRig.test.ts covers marker hierarchy, asymmetric placement, transformed
models, normalized weight commits, preserving existing rigs/clips, undo, and stale
preview rejection. UI checks use the default cube to verify workflow mechanics;
anatomical deformation quality still requires evaluation on real character assets.
