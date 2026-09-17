# Animation & Armatures

Three objects, three verbs. Do not invent a fourth path.

```
Armature Bones / Meshes  →  Active Animation Clip  →  Clips Library (Idle, Walk, Attack, Death)
                                     ↑
                        activeClipId = Timeline target
```

| Thing | What it is | What it is not |
| :--- | :--- | :--- |
| **Animation Clip** (`AnimationClip`) | A named collection of bone and mesh keyframe tracks (`Idle`, `Walk`, `Jump`, `Attack`). | Not the armature skeleton. Not a single keyframe. |
| **Timeline target** (`activeClipId`) | Which animation clip is currently active in the timeline, dopesheet, curve editor, and viewport playback. | Not a permanent bake into 3D geometry. |
| **Track** (`AnimationTrack`) | Position, rotation, and scale keyframe channels targeting a specific bone or mesh. | Not a standalone animation clip. |

`animationStore.activeClip` is a computed helper for the currently inspected/played clip.

---

## The three verbs

All of these live on `animationStore`. UI must call them instead of mutating `armature.clips` / `armature.activeClipId` by hand.

### 1. `selectClip(id)`

Sets the timeline target (`armature.activeClipId`). Resets playback frame to 0 and evaluates the pose. Does **not** mutate keyframes. No undo step.

- **Use**: Timeline clip dropdown, Action selector in Dopesheet, NLA strip selection.

### 2. `createClip(name?, durationFrames?, fps?, options?)`

Adds a new animation clip to the library and selects it.

- `options.record` default `true` (one undo item).
- `options.select` default `true` (becomes the timeline target).
- `options.loop` default `true`.
- `addClip(...)` is the same function (compatibility alias).

- **Use**: Timeline **+ New Action** button, procedural generators (`generateIdleBreathe`, `generateWalkCycle`).

### 3. `evaluatePose(frame?)`

Samples all bone & mesh tracks at the specified frame (or current timeline frame) and applies rotations, translations, and scales to the skeleton and scene.

- Evaluates keyframe curves with selected interpolation:
  - `'step'`: Immediate constant jumps (authentic retro PSX/Saturn stepping).
  - `'linear'`: Clean constant velocity transitions.
  - `'cubic'`: Catmull-Rom smooth ease-in / ease-out curves.
  - `'bezier'`: Custom tangent handle curve evaluation.
- Then runs enabled **IK constraints** (`applyIKConstraints`: two-bone + pole when chain is 2, otherwise CCD). Springs still step in the viewport loop while playing or test-posing — they are not baked into keys.

- **Use**: Viewport frame change, playback tick (`togglePlay`), timeline scrubbing.

---

## Clip management helpers

- `duplicateClip(clipId)` — clones clip and keyframe tracks into `${clip.name}_Copy`.
- `deleteClip(clipId)` — removes clip from library and falls back to first clip.
- `renameClip(clipId, newName)` — updates clip name for game engine exports.
- `setClipDuration(frames)` — adjusts total timeline frame length.

---

## Game engine export contract (GLTF / GLB)

When exporting via `GltfExport.ts`:
- Each `AnimationClip` in `armature.clips` is converted into a standard `THREE.AnimationClip` with `VectorKeyframeTrack` (position/scale) and `QuaternionKeyframeTrack` (rotation).
- Multi-clip GLTF/GLB models import directly into **Godot AnimationPlayer**, **Unity Animator Controller**, and **Unreal Engine** with zero re-rigging required.

---

## Which UI does what

| UI | New | Select | Evaluate / Play |
| :--- | :--- | :--- | :--- |
| **TimelineBar (Bottom)** | `createClip` | `selectClip` | `togglePlay`, `setFrame`, `evaluatePose` |
| **Anim inspector** | `createClip` | `selectClip` | Key (I/K), auto-key on gizmo **release** |
| **ActionSelector (Header/Dopesheet)** | `createClip` / `duplicateClip` | `selectClip` | — |
| **Procedural Action Generator** | `createClip` + inject keys | `selectClip` | `evaluatePose` |

---

## Bone overlay vs interaction

`animationStore.showBones` (synced to `viewport.showBones`) is the only visibility flag. View → Bones, the viewport bone button, and the command palette all call `toggleShowBones`.

| Workspace | Overlay if shown | Click / hover / box-select bones |
| :--- | :--- | :--- |
| Rig, Animate | Full opacity | Yes |
| Modeling, UV / Paint | Dim overlay; no selection highlight | No — mesh / UV / paint keep the click |

X-ray bones (`xrayBones` or viewport X-Ray) only changes depth test. It does not make bones selectable in Model.

## Rig workspace

- **Skel** = add + hierarchy. **Bone** = rest, IK, sockets, spring. **Bind** = Use-on / target / method. **Wts** = paint + selection. Same inspector chrome as Object / UV (`UiSection`).
- Object bind writes `parentBoneId`, not `parentId`.
- Animate / Rig test-pose: bone gizmo and playback deform bound meshes live (`refreshLiveDeform` — skin weights + `parentBoneId`). Full `rebuildMeshes` waits until gizmo release.
- Enable IK on the Bone tab; `evaluatePose` re-solves it after sampling keys. Two-bone + pole when chain length is 2.
- Click-to-place auto-weights only the first bone.

## Animate workspace shortcuts

| Input | Action |
| :--- | :--- |
| Space | Play / pause (`togglePlay`). Stops if you leave Animate. |
| I / K | Insert key on the selected bone, or the active object if no bone is selected |
| Shift+D | Duplicate keys on this frame onto the next frame (`duplicateKeysAtCurrentFrame`) |
| Delete / X | Delete keys on the selected bone at this frame (does not delete bones) |
| Ctrl+C / Ctrl+V | Copy / paste pose (not mesh clipboard). Ctrl+Shift+V pastes flipped. |
| Alt+R | Reset pose (auto-keys if Auto-key is on) |
| ← → / , . | Previous / next frame |
| RMB drag | Pan the viewport, scroll the dope sheet, or pan the graph editor |
| Graph LMB drag | Drag a curve key vertically (one undo step) |

Onion skin is a viewport overlay. Toggle it on the Animate inspector Playback section (`onionSkin`, `onionFramesCount`, `onionOpacity`). Ghosts are red (past) and green (future).

`updateKeyframeValue` records undo unless you pass `{ record: false }` (used while dragging a graph key after the first sample).

Bind / unbind geometry (Ctrl+P / Alt+P) is **Rig only**. Extrude bone (E) is **Rig only**.

## Do not

- Extrude bones with **E** in Animate (that is Rig-only). Use **I** / **K** to key.
- Mutate `armature.activeClipId` directly without calling `selectClip(id)` (which evaluates pose and resets frame).
- Bake skeletal keyframes destructively into the rest pose vertices.
- Export animations in a custom non-standard proprietary format; keep GLTF/GLB standard PBR / SkinnedMesh keyframes.


## Animation workspace essentials and advanced controls

The inspector starts in **Essentials**, with a short select → pose → key → play guide and a direct route to Rigging for objects without a skeleton. **Advanced** exposes bone scale, IK/spring status, generators, clip blending, and mesh parenting.

- **Create game clip** accepts a name, duration in seconds, frame rate (12–60 fps), and loop setting. New clips default to one second at 30 fps; existing clips keep their timing.
- **Pose & keyframes** shows whether the selected target has a key at this frame, with previous/next key navigation. **Delete target key** affects only the selected bone or object; **Key entire scene** explicitly records all bones and meshes.
- Typed bone position, rotation, and scale edits go through `setBonePoseValue`. Each change pauses playback, rejects non-finite values, records undo before mutation, and keys the edited channel when auto-key is enabled.
- Bone search displays parent depth and IK badges, with access to the floating hierarchy.
- The keyframe editor supports name search, selected-only and animated-only track filters, and expand/collapse for visible channels. Filtering does not remove tracks or change playback/export.


## Quick Pose & Animate popup

Open **Quick Pose** from the keyframe editor or **Open Quick Pose & Animate** from the inspector. The draggable, minimizable panel stays available while working in Animation and follows the active bone or object.

Choose Move, Rotate, or Scale to activate the matching viewport gizmo. Type axis values or use ± with a custom step; Shift-click uses one tenth of the step. Bone values are local pose offsets, and parent/child navigation helps move through a chain. IK-controlled bones display a note because playback solves their constraints.

For animation, choose a clip and frame, pose the target, then **Insert key** or **Key & next**. The latter saves all transform channels and advances by the chosen frame count. Play/Pause, looping, and auto-key are available in the panel. With auto-key disabled, insert a key before moving to another frame. Edits pause playback and share the existing undo history; channel resets are a single undo step. No rest skeleton geometry is modified.


The pose popup uses a three-part layout: Target, Adjust pose, and Animate. Drag the labelled header to move it, use the position menu for Left/Center/Right placement, or drag the lower-right grip to resize. The focused move handle also accepts arrow keys (Shift for larger moves). Placement is kept while the component remains mounted, including close/reopen. The panel stays inside the window on resize.

Animation controls remain in a fixed footer while the pose area scrolls. A frame slider scrubs and pauses playback. Search and help expand on demand; an empty scene offers a route to Modeling instead of a bank of disabled transform fields. Undo/Redo uses the shared project history, and Escape closes the popup.
