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

## Do not

- Extrude bones with **E** in Animate (that is Rig-only). Use **I** / **K** to key.
- Mutate `armature.activeClipId` directly without calling `selectClip(id)` (which evaluates pose and resets frame).
- Bake skeletal keyframes destructively into the rest pose vertices.
- Export animations in a custom non-standard proprietary format; keep GLTF/GLB standard PBR / SkinnedMesh keyframes.
