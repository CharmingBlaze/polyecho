import { actionRegistry, type CommandAction } from './ActionRegistry'
import { requestExport, requestModalTool, requestPrimitivePlacement, requestCameraView, requestFillFace, requestSmartUvProject, requestKnifeProject, requestProjectFromView } from './editorCommands'
import { canHideSelected, canHideUnselected, canIsolateSelected, canShowHidden, hideSelected, hideUnselected, isolateSelected, showHidden } from '../geometry/ObjectVisibility'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import { useAnimationStore } from '../../stores/animationStore'
import { useHistoryStore } from '../../stores/historyStore'
import { saveOpenProject } from '../project/projectIo'

export function setupDefaultActions(
  projectStore: ReturnType<typeof useProjectStore>,
  toolStore: ReturnType<typeof useToolStore>,
  animationStore: ReturnType<typeof useAnimationStore>,
  historyStore: ReturnType<typeof useHistoryStore>
) {
  const actions: CommandAction[] = [
    // 1. MODELING OPERATORS
    {
      id: 'extrude',
      label: 'Extrude Region',
      category: 'Modeling',
      shortcut: 'e',
      icon: 'extrude',
      handler: () => requestModalTool('extrude')
    },
    {
      id: 'extrude_individual',
      label: 'Extrude Individual',
      category: 'Modeling',
      shortcut: 'Alt+e',
      icon: 'extrude',
      handler: () => {
        if (projectStore.activeMesh && projectStore.selectedFaceIds.length > 0) {
          requestModalTool('extrude', { individual: true })
        }
      }
    },
    {
      id: 'inset',
      label: 'Inset Faces',
      category: 'Modeling',
      shortcut: 'i',
      icon: 'inset',
      handler: () => requestModalTool('inset')
    },
    {
      id: 'bevel',
      label: 'Bevel Edges',
      category: 'Modeling',
      shortcut: 'Ctrl+b',
      icon: 'bevel',
      handler: () => requestModalTool('bevel')
    },
    {
      id: 'loopcut',
      label: 'Loop Cut and Slide',
      category: 'Modeling',
      shortcut: 'Ctrl+r',
      icon: 'loop-cut',
      handler: () => requestModalTool('loop_cut')
    },
    {
      id: 'knife',
      label: 'Knife Topology',
      category: 'Modeling',
      shortcut: 'k',
      icon: 'knife',
      handler: () => requestModalTool('knife')
    },
    {
      id: 'edge_slide',
      label: 'Edge Slide',
      category: 'Modeling',
      shortcut: 'Shift+g',
      handler: () => requestModalTool('edge_slide')
    },
    {
      id: 'vertex_slide',
      label: 'Vertex Slide',
      category: 'Modeling',
      shortcut: 'Shift+v',
      handler: () => requestModalTool('vertex_slide')
    },
    {
      id: 'offset_loop',
      label: 'Offset Edge Loop',
      category: 'Modeling',
      shortcut: 'Ctrl+Shift+r',
      handler: () => requestModalTool('offset_loop')
    },
    {
      id: 'bisect',
      label: 'Bisect',
      category: 'Modeling',
      handler: () => requestModalTool('bisect')
    },
    {
      id: 'spin',
      label: 'Spin',
      category: 'Modeling',
      handler: () => requestModalTool('spin')
    },
    {
      id: 'shrink_fatten',
      label: 'Shrink/Fatten',
      category: 'Modeling',
      shortcut: 'Alt+s',
      handler: () => requestModalTool('shrink_fatten')
    },
    {
      id: 'shear',
      label: 'Shear',
      category: 'Modeling',
      handler: () => requestModalTool('shear')
    },
    {
      id: 'to_sphere',
      label: 'Spherize (drag)',
      category: 'Modeling',
      shortcut: 'Shift+Alt+s',
      handler: () => requestModalTool('to_sphere')
    },
    {
      id: 'curve',
      label: 'Curve',
      category: 'Modeling',
      handler: () => requestModalTool('curve')
    },
    {
      id: 'shapedraw',
      label: 'Shape Draw — Outline, Path, Sections',
      category: 'Modeling',
      icon: 'face-select',
      handler: () => {
        toolStore.setAppMode('blockout')
        requestModalTool('shapedraw')
      }
    },
    {
      id: 'polydraw',
      label: 'Poly Draw (Blockout)',
      category: 'Modeling',
      shortcut: 'f',
      icon: 'face-select',
      handler: () => {
        if (toolStore.appMode === 'blockout') requestModalTool('polydraw')
      }
    },
    {
      id: 'polybuild',
      label: 'Poly Build (Blockout)',
      category: 'Modeling',
      shortcut: 'v',
      icon: 'vertex-select',
      handler: () => {
        if (toolStore.appMode === 'blockout') requestModalTool('polybuild')
      }
    },
    {
      id: 'grab',
      label: 'Move / Translate',
      category: 'Transform',
      shortcut: 'g',
      icon: 'move',
      handler: () => requestModalTool('grab')
    },
    {
      id: 'rotate',
      label: 'Rotate Tool',
      category: 'Transform',
      shortcut: 'r',
      icon: 'rotate',
      handler: () => requestModalTool('rotate')
    },
    {
      id: 'scale',
      label: 'Scale Tool',
      category: 'Transform',
      shortcut: 's',
      icon: 'scale',
      handler: () => requestModalTool('scale')
    },
    {
      id: 'flip_object_h',
      label: 'Flip Horizontal (X)',
      category: 'Transform',
      handler: () => projectStore.performFlipAxis('x')
    },
    {
      id: 'flip_object_v',
      label: 'Flip Vertical (Y)',
      category: 'Transform',
      handler: () => projectStore.performFlipAxis('y')
    },
    {
      id: 'flip_object_z',
      label: 'Flip Z',
      category: 'Transform',
      handler: () => projectStore.performFlipAxis('z')
    },
    {
      id: 'rotate_object_90_y',
      label: 'Rotate Object 90° Y',
      category: 'Transform',
      handler: () => projectStore.performRotateObject('y', 90)
    },
    {
      id: 'rotate_object_neg90_y',
      label: 'Rotate Object -90° Y',
      category: 'Transform',
      handler: () => projectStore.performRotateObject('y', -90)
    },
    {
      id: 'rotate_object_180_y',
      label: 'Rotate Object 180° Y',
      category: 'Transform',
      handler: () => projectStore.performRotateObject('y', 180)
    },
    {
      id: 'mirror_copy_x',
      label: 'Mirror Copy X',
      category: 'Transform',
      handler: () => projectStore.performDuplicateMirror('x')
    },
    {
      id: 'mirror_copy_y',
      label: 'Mirror Copy Y',
      category: 'Transform',
      handler: () => projectStore.performDuplicateMirror('y')
    },
    {
      id: 'mirror_copy_z',
      label: 'Mirror Copy Z',
      category: 'Transform',
      handler: () => projectStore.performDuplicateMirror('z')
    },
    {
      id: 'mirror_plane',
      label: 'Mirror Across Plane',
      category: 'Transform',
      handler: () => projectStore.performMirror('x')
    },
    {
      id: 'linear_array',
      label: 'Linear Array',
      category: 'Transform',
      handler: () => projectStore.performLinearArray()
    },
    {
      id: 'radial_array',
      label: 'Radial Array',
      category: 'Transform',
      handler: () => projectStore.performRadialArray()
    },
    {
      id: 'instance_duplicate',
      label: 'Instance Duplicate',
      category: 'Transform',
      handler: () => projectStore.performInstanceDuplicate()
    },
    {
      id: 'snap_grid',
      label: 'Snap to Grid',
      category: 'Transform',
      handler: () => projectStore.performSnap('grid')
    },
    {
      id: 'snap_vertex',
      label: 'Snap to Vertex',
      category: 'Transform',
      handler: () => projectStore.performSnap('vertex')
    },
    {
      id: 'snap_edge',
      label: 'Snap to Edge',
      category: 'Transform',
      handler: () => projectStore.performSnap('edge')
    },
    {
      id: 'snap_face',
      label: 'Snap to Face',
      category: 'Transform',
      handler: () => projectStore.performSnap('face')
    },
    {
      id: 'apply_rotation_scale',
      label: 'Apply Rotation & Scale',
      category: 'Transform',
      handler: () => projectStore.performApplyRotationScale()
    },
    {
      id: 'make_unique',
      label: 'Make Unique',
      category: 'Transform',
      handler: () => projectStore.performMakeUnique()
    },
    {
      id: 'align_center_x',
      label: 'Align Center X',
      category: 'Transform',
      handler: () => projectStore.performAlign('x', 'center')
    },
    {
      id: 'align_cursor_x',
      label: 'Align to Cursor X',
      category: 'Transform',
      handler: () => projectStore.performAlign('x', 'cursor')
    },
    {
      id: 'align_min_y',
      label: 'Align Min Y',
      category: 'Transform',
      handler: () => projectStore.performAlign('y', 'min')
    },
    {
      id: 'align_max_z',
      label: 'Align Max Z',
      category: 'Transform',
      handler: () => projectStore.performAlign('z', 'max')
    },
    {
      id: 'select_boundary',
      label: 'Select Boundary',
      category: 'Selection',
      handler: () => projectStore.selectBoundaryEdges()
    },
    {
      id: 'select_nonmanifold',
      label: 'Select Non-manifold',
      category: 'Selection',
      handler: () => projectStore.selectNonManifoldEdges()
    },
    {
      id: 'select_sharp',
      label: 'Select Sharp Edges',
      category: 'Selection',
      handler: () => projectStore.selectSharpEdges()
    },
    {
      id: 'mark_sharp',
      label: 'Mark Sharp',
      category: 'Shading',
      handler: () => projectStore.markSelectedEdgesSharp()
    },
    {
      id: 'clear_sharp',
      label: 'Clear Sharp',
      category: 'Shading',
      handler: () => projectStore.clearSelectedEdgesSharp()
    },

    // 2. TOPOLOGY
    {
      id: 'subdivide',
      label: 'Subdivide',
      category: 'Topology',
      shortcut: 'w',
      icon: 'subdivide',
      handler: () => {
        if (projectStore.activeMesh) {
          if (toolStore.selectMode === 'object' || toolStore.selectMode === 'vertex' || toolStore.selectMode === 'edge' || toolStore.selectMode === 'face') {
            projectStore.performSubdivide(toolStore.selectMode)
          }
        }
      }
    },
    {
      id: 'simple_subdivide',
      label: 'Simple Subdivide',
      category: 'Topology',
      handler: () => {
        if (toolStore.selectMode === 'object' || toolStore.selectMode === 'vertex' || toolStore.selectMode === 'edge' || toolStore.selectMode === 'face') {
          projectStore.performSimpleSubdivide(toolStore.selectMode)
        }
      }
    },
    {
      id: 'catmull_clark',
      label: 'Catmull-Clark Subdivide',
      category: 'Topology',
      handler: () => projectStore.performCatmullClark()
    },
    {
      id: 'spherize',
      label: 'Spherize',
      category: 'Topology',
      handler: () => projectStore.performSpherize()
    },
    {
      id: 'poke_faces',
      label: 'Poke Faces',
      category: 'Topology',
      shortcut: 'Alt+p',
      handler: () => {
        if (projectStore.activeMesh) projectStore.performPokeFaces()
      }
    },
    {
      id: 'triangulate',
      label: 'Triangulate Faces',
      category: 'Topology',
      shortcut: 'Ctrl+t',
      handler: () => {
        if (projectStore.activeMesh) projectStore.performTriangulate()
      }
    },
    {
      id: 'dissolve',
      label: 'Dissolve Selection',
      category: 'Topology',
      shortcut: 'Ctrl+x',
      icon: 'dissolve',
      handler: () => {
        if (toolStore.selectMode === 'edge') projectStore.performDissolve('edge')
        else if (toolStore.selectMode === 'face') projectStore.performDissolve('face')
        else if (toolStore.selectMode === 'vertex') projectStore.performDissolve('vertex')
      }
    },
    {
      id: 'bridge_edges',
      label: 'Bridge Edge Loops',
      category: 'Topology',
      icon: 'bridge-edges',
      handler: () => requestModalTool('bridge')
    },
    {
      id: 'grid_fill',
      label: 'Grid Fill',
      category: 'Topology',
      handler: () => {
        if (projectStore.activeMesh) projectStore.performGridFill()
      }
    },
    {
      id: 'fill_face',
      label: 'Fill Face from Boundary (Model)',
      category: 'Topology',
      shortcut: 'f',
      icon: 'face-select',
      handler: () => {
        if (toolStore.appMode === 'model' && projectStore.activeMesh) {
          requestFillFace()
        }
      }
    },
    {
      id: 'connect_verts',
      label: 'Connect Vertex Path',
      category: 'Topology',
      shortcut: 'j',
      handler: () => {
        if (projectStore.activeMesh) {
          projectStore.performConnectVertices()
        }
      }
    },
    {
      id: 'merge_verts',
      label: 'Merge Vertices (Center)',
      category: 'Topology',
      shortcut: 'm',
      icon: 'merge',
      handler: () => {
        if (projectStore.activeMesh) {
          projectStore.performMerge('center')
        }
      }
    },
    {
      id: 'merge_first',
      label: 'Merge at First',
      category: 'Topology',
      handler: () => projectStore.performMerge('first')
    },
    {
      id: 'merge_last',
      label: 'Merge at Last',
      category: 'Topology',
      handler: () => projectStore.performMerge('last')
    },
    {
      id: 'merge_cursor',
      label: 'Merge at Cursor',
      category: 'Topology',
      handler: () => projectStore.performMerge('cursor')
    },
    {
      id: 'merge_vertex',
      label: 'Merge at Vertex',
      category: 'Topology',
      handler: () => projectStore.performMerge('vertex')
    },
    {
      id: 'weld_distance',
      label: 'Weld by Distance',
      category: 'Topology',
      handler: () => projectStore.performMerge('distance')
    },
    {
      id: 'split_edge',
      label: 'Split Edge',
      category: 'Topology',
      handler: () => projectStore.performSplitEdges()
    },
    {
      id: 'flip_normals',
      label: 'Flip Normals',
      category: 'Topology',
      shortcut: 'Shift+n',
      handler: () => {
        if (projectStore.activeMesh) {
          projectStore.performFlipNormals()
        }
      }
    },
    {
      id: 'shade_smooth',
      label: 'Shade Smooth',
      category: 'Shading',
      handler: () => projectStore.setShadeMode('smooth'),
      disabled: () => !projectStore.activeMesh
    },
    {
      id: 'shade_flat',
      label: 'Shade Flat',
      category: 'Shading',
      handler: () => projectStore.setShadeMode('flat'),
      disabled: () => !projectStore.activeMesh
    },
    {
      id: 'shade_smooth_by_angle',
      label: 'Shade Smooth by Angle',
      category: 'Shading',
      handler: () => projectStore.setShadeMode('auto'),
      disabled: () => !projectStore.activeMesh
    },
    {
      id: 'delete_element',
      label: 'Delete Selected',
      category: 'Topology',
      shortcut: 'x',
      handler: () => {
        if (toolStore.selectMode === 'bone' || toolStore.appMode === 'rig') {
          if (animationStore.selectedBoneId) {
            animationStore.deleteBone(animationStore.selectedBoneId)
          }
        } else if (toolStore.selectMode === 'object' || toolStore.selectMode === 'vertex' || toolStore.selectMode === 'edge' || toolStore.selectMode === 'face') {
          projectStore.performDelete(toolStore.selectMode)
        }
      }
    },
    {
      id: 'separate_mesh',
      label: 'Separate Selection',
      category: 'Topology',
      shortcut: 'p',
      handler: () => {
        if (projectStore.activeMesh) {
          projectStore.performSeparateMesh()
        }
      }
    },
    {
      id: 'join_meshes',
      label: 'Join Meshes',
      category: 'Topology',
      shortcut: 'Ctrl+j',
      handler: () => {
        projectStore.performJoinMeshes()
      }
    },
    {
      id: 'duplicate',
      label: 'Duplicate Selection',
      category: 'Topology',
      shortcut: 'Shift+d',
      handler: () => {
        projectStore.duplicateSelection(toolStore.selectMode)
      }
    },
    {
      id: 'clean_mesh',
      label: 'Clean Degenerate Geometry',
      category: 'Topology',
      handler: () => {
        if (projectStore.activeMesh) {
          projectStore.performCleanupMesh()
        }
      }
    },
    {
      id: 'flip_edge',
      label: 'Rotate Edge',
      category: 'Topology',
      shortcut: 'Ctrl+Shift+f',
      handler: () => projectStore.performFlipEdge()
    },
    {
      id: 'recalculate_outside',
      label: 'Recalculate Outside',
      category: 'Topology',
      shortcut: 'Ctrl+Shift+n',
      handler: () => projectStore.performRecalculateOutside()
    },
    {
      id: 'tris_to_quads',
      label: 'Tris to Quads',
      category: 'Topology',
      shortcut: 'Alt+j',
      handler: () => projectStore.performTrisToQuads()
    },
    {
      id: 'make_planar',
      label: 'Make Planar Faces',
      category: 'Topology',
      handler: () => projectStore.performMakePlanar()
    },
    {
      id: 'fill_holes',
      label: 'Fill Holes',
      category: 'Topology',
      shortcut: 'Alt+f',
      handler: () => projectStore.performFillHoles()
    },
    {
      id: 'limited_dissolve',
      label: 'Limited Dissolve',
      category: 'Topology',
      handler: () => projectStore.performLimitedDissolve()
    },
    {
      id: 'delete_only_faces',
      label: 'Delete Only Faces',
      category: 'Topology',
      handler: () => projectStore.performDeleteOnlyFaces()
    },
    {
      id: 'delete_only_edges',
      label: 'Delete Only Edges',
      category: 'Topology',
      handler: () => projectStore.performDeleteOnlyEdges()
    },
    {
      id: 'rip',
      label: 'Rip',
      category: 'Topology',
      shortcut: 'Ctrl+Shift+v',
      handler: () => projectStore.performRip(false)
    },
    {
      id: 'rip_fill',
      label: 'Rip Fill',
      category: 'Topology',
      shortcut: 'Alt+v',
      handler: () => projectStore.performRip(true)
    },
    {
      id: 'split_faces',
      label: 'Detach Faces',
      category: 'Topology',
      shortcut: 'y',
      handler: () => projectStore.performSplit()
    },
    {
      id: 'vertex_bevel',
      label: 'Vertex Bevel',
      category: 'Topology',
      shortcut: 'Ctrl+Shift+b',
      handler: () => projectStore.performVertexBevel()
    },
    {
      id: 'solidify_faces',
      label: 'Solidify',
      category: 'Topology',
      handler: () => projectStore.performSolidifyFaces()
    },
    {
      id: 'lathe',
      label: 'Lathe / Revolve',
      category: 'Topology',
      handler: () => projectStore.performLathe()
    },
    {
      id: 'shell',
      label: 'Shell',
      category: 'Topology',
      handler: () => projectStore.performShell()
    },
    {
      id: 'symmetrize_x',
      label: 'Symmetrize X',
      category: 'Topology',
      handler: () => projectStore.performSymmetrize('x')
    },
    {
      id: 'smooth_verts',
      label: 'Smooth Vertices',
      category: 'Topology',
      handler: () => projectStore.performSmoothVertices()
    },
    {
      id: 'circle_loop',
      label: 'Circle',
      category: 'Topology',
      handler: () => projectStore.performCircle()
    },
    {
      id: 'straighten_horizontal',
      label: 'Straighten Horizontal',
      category: 'Topology',
      handler: () => projectStore.performStraighten('horizontal')
    },
    {
      id: 'straighten_vertical',
      label: 'Straighten Vertical',
      category: 'Topology',
      handler: () => projectStore.performStraighten('vertical')
    },
    {
      id: 'randomize_verts',
      label: 'Randomize Vertices',
      category: 'Topology',
      handler: () => projectStore.performRandomizeVertices()
    },
    {
      id: 'unsubdivide',
      label: 'Unsubdivide',
      category: 'Topology',
      handler: () => projectStore.performUnsubdivide()
    },
    {
      id: 'decimate',
      label: 'Decimate',
      category: 'Topology',
      handler: () => projectStore.performDecimate()
    },
    {
      id: 'boolean_union',
      label: 'Boolean Union',
      category: 'Topology',
      handler: () => projectStore.performBoolean('union')
    },
    {
      id: 'boolean_difference',
      label: 'Boolean Difference',
      category: 'Topology',
      handler: () => projectStore.performBoolean('difference')
    },
    {
      id: 'boolean_intersect',
      label: 'Boolean Intersect',
      category: 'Topology',
      handler: () => projectStore.performBoolean('intersect')
    },
    {
      id: 'knife_project',
      label: 'Knife Project',
      category: 'Topology',
      handler: () => requestKnifeProject()
    },
    {
      id: 'separate_loose',
      label: 'Separate by Loose Parts',
      category: 'Topology',
      handler: () => projectStore.performSeparateByLooseParts()
    },
    {
      id: 'separate_material',
      label: 'Separate by Material',
      category: 'Topology',
      handler: () => projectStore.performSeparateByMaterial()
    },

    // 3. SELECTION
    {
      id: 'select_all',
      label: 'Select All',
      category: 'Selection',
      shortcut: 'Ctrl+a',
      handler: () => projectStore.selectAll(toolStore.selectMode)
    },
    {
      id: 'deselect_all',
      label: 'Deselect All',
      category: 'Selection',
      shortcut: 'Alt+a',
      handler: () => projectStore.deselectAll()
    },
    {
      id: 'select_invert',
      label: 'Invert Selection',
      category: 'Selection',
      shortcut: 'Ctrl+i',
      handler: () => projectStore.selectInverse(toolStore.selectMode)
    },
    {
      id: 'select_more',
      label: 'Select More',
      category: 'Selection',
      shortcut: 'Ctrl+=',
      handler: () => projectStore.growSelection(toolStore.selectMode)
    },
    {
      id: 'select_less',
      label: 'Select Less',
      category: 'Selection',
      shortcut: 'Ctrl+-',
      handler: () => projectStore.shrinkSelection(toolStore.selectMode)
    },
    {
      id: 'select_linked',
      label: 'Select Linked',
      category: 'Selection',
      shortcut: 'Ctrl+l',
      handler: () => projectStore.selectConnected(toolStore.selectMode)
    },
    {
      id: 'box_select',
      label: 'Box Select (Marquee)',
      category: 'Selection',
      shortcut: 'b',
      icon: 'marquee',
      handler: () => { toolStore.toggleBoxSelect() }
    },
    {
      id: 'mode_vertex',
      label: 'Vertex Mode',
      category: 'Selection',
      shortcut: '1',
      icon: 'vertex-select',
      handler: () => toolStore.enterSelectMode('vertex')
    },
    {
      id: 'mode_edge',
      label: 'Edge Mode',
      category: 'Selection',
      shortcut: '2',
      icon: 'edge-select',
      handler: () => toolStore.enterSelectMode('edge')
    },
    {
      id: 'mode_face',
      label: 'Face Mode',
      category: 'Selection',
      shortcut: '3',
      icon: 'face-select',
      handler: () => toolStore.enterSelectMode('face')
    },
    {
      id: 'mode_object',
      label: 'Object Mode',
      category: 'Selection',
      shortcut: '4',
      icon: 'mesh-cube',
      handler: () => toolStore.enterSelectMode('object')
    },
    {
      id: 'mode_origin',
      label: 'Origin / Pivot Mode',
      category: 'Selection',
      shortcut: '5',
      handler: () => {
        if (toolStore.appMode === 'rig' || toolStore.appMode === 'animate') return
        if (!toolStore.isMeshWorkspace() && toolStore.appMode !== 'uvpaint') toolStore.setAppMode('model')
        toolStore.enterSelectMode('origin')
      }
    },
    {
      id: 'mode_bone',
      label: 'Bone Selection Mode',
      category: 'Selection',
      shortcut: '6',
      icon: 'bone',
      handler: () => toolStore.enterSelectMode('bone')
    },
    {
      id: 'toggle_edit_object',
      label: 'Toggle Edit/Object Mode',
      category: 'Selection',
      shortcut: 'Tab',
      handler: () => {
        if (toolStore.appMode === 'uvpaint' || toolStore.appMode === 'rig' || toolStore.appMode === 'animate') return
        if (!toolStore.isMeshWorkspace()) toolStore.setAppMode('model')
        toolStore.selectMode = toolStore.selectMode === 'object' ? 'face' : 'object'
      }
    },

    // 4. PRIMITIVES
    {
      id: 'add_primitive',
      label: 'Add Primitive Placement',
      category: 'Primitives',
      shortcut: 'Shift+a',
      icon: 'mesh-cube',
      handler: () => requestPrimitivePlacement({ type: 'BOX' })
    },
    {
      id: 'add_cube',
      label: 'Add Box / Cube',
      category: 'Primitives',
      icon: 'mesh-cube',
      handler: () => requestPrimitivePlacement({ type: 'BOX' })
    },
    {
      id: 'add_plane',
      label: 'Add Plane Surface',
      category: 'Primitives',
      icon: 'mesh-plane',
      handler: () => requestPrimitivePlacement({ type: 'PLANE' })
    },
    {
      id: 'add_cylinder',
      label: 'Add Cylinder',
      category: 'Primitives',
      icon: 'mesh-cylinder',
      handler: () => requestPrimitivePlacement({ type: 'CYLINDER' })
    },
    {
      id: 'add_sphere',
      label: 'Add UV Sphere',
      category: 'Primitives',
      icon: 'mesh-uvsphere',
      handler: () => requestPrimitivePlacement({ type: 'SPHERE' })
    },

    // 5. MODIFIERS
    {
      id: 'mod_mirror',
      label: 'Add Mirror Modifier',
      category: 'Modifiers',
      icon: 'modifier-mirror',
      handler: () => projectStore.addModifier('mirror')
    },
    {
      id: 'mod_solidify',
      label: 'Add Solidify Modifier',
      category: 'Modifiers',
      icon: 'modifier-solidify',
      handler: () => projectStore.addModifier('solidify')
    },
    {
      id: 'mod_subdivide',
      label: 'Add Subdivision Surface Modifier',
      category: 'Modifiers',
      icon: 'subdivide',
      handler: () => projectStore.addModifier('subdivision')
    },

    // 6. SHADING & VIEWPORT
    {
      id: 'hide_selected',
      label: 'Hide Selected Objects',
      category: 'Viewport',
      shortcut: 'Ctrl+h',
      handler: () => {
        if (!canHideSelected(projectStore.meshes, projectStore.selectedMeshIds)) return
        projectStore.recordState('Hide Selected')
        hideSelected(projectStore.meshes, projectStore.selectedMeshIds)
      }
    },
    {
      id: 'hide_unselected',
      label: 'Hide Unselected Objects',
      category: 'Viewport',
      shortcut: 'Ctrl+Shift+h',
      handler: () => {
        if (!canHideUnselected(projectStore.meshes, projectStore.selectedMeshIds)) return
        projectStore.recordState('Hide Unselected')
        hideUnselected(projectStore.meshes, projectStore.selectedMeshIds)
      }
    },
    {
      id: 'isolate_selected',
      label: 'Isolate Selected Objects',
      category: 'Viewport',
      shortcut: 'Ctrl+Alt+i',
      handler: () => {
        if (!canIsolateSelected(projectStore.meshes, projectStore.selectedMeshIds)) return
        projectStore.recordState('Isolate Selected')
        isolateSelected(projectStore.meshes, projectStore.selectedMeshIds)
      }
    },
    {
      id: 'show_hidden',
      label: 'Show Hidden Objects',
      category: 'Viewport',
      shortcut: 'Ctrl+Alt+h',
      handler: () => {
        if (!canShowHidden(projectStore.meshes)) return
        projectStore.recordState('Show Hidden')
        showHidden(projectStore.meshes)
      }
    },
    {
      id: 'toggle_xray',
      label: 'Toggle X-Ray Mode',
      category: 'Viewport',
      shortcut: 'Alt+z',
      icon: 'xray',
      handler: () => { toolStore.viewport.xray = !toolStore.viewport.xray }
    },
    {
      id: 'toggle_combined_gizmo',
      label: 'Toggle Combined Gizmo',
      category: 'Viewport',
      icon: 'gizmo-combined',
      handler: () => { toolStore.viewport.combinedGizmo = !toolStore.viewport.combinedGizmo }
    },
    {
      id: 'toggle_symmetry',
      label: 'Toggle Live X-Symmetry',
      category: 'Viewport',
      handler: () => { toolStore.viewport.symmetryX = !toolStore.viewport.symmetryX }
    },
    {
      id: 'toggle_face_orientation',
      label: 'Toggle Face Orientation',
      category: 'Viewport',
      handler: () => { toolStore.viewport.faceOrientation = !toolStore.viewport.faceOrientation }
    },
    {
      id: 'view_top',
      label: 'Top Orthographic View',
      category: 'Viewport',
      shortcut: 'Numpad7',
      handler: () => requestCameraView('top')
    },
    {
      id: 'view_front',
      label: 'Front Orthographic View',
      category: 'Viewport',
      shortcut: 'Numpad1',
      handler: () => requestCameraView('front')
    },
    {
      id: 'view_right',
      label: 'Right Orthographic View',
      category: 'Viewport',
      shortcut: 'Numpad3',
      handler: () => requestCameraView('right')
    },
    {
      id: 'view_camera',
      label: 'Toggle Perspective / Camera',
      category: 'Viewport',
      shortcut: 'Numpad0',
      handler: () => requestCameraView('persp')
    },

    // 7. SYSTEM
    {
      id: 'save_project',
      label: 'Save Project JSON',
      category: 'File & Project',
      shortcut: 'Ctrl+s',
      handler: () => {
        void saveOpenProject()
      }
    },
    {
      id: 'undo',
      label: 'Undo',
      category: 'File & Project',
      shortcut: 'Ctrl+z',
      handler: () => historyStore.undo()
    },
    {
      id: 'redo',
      label: 'Redo',
      category: 'File & Project',
      shortcut: 'Ctrl+Shift+z',
      handler: () => historyStore.redo()
    },
    {
      id: 'export_model',
      label: 'Export 3D Model',
      category: 'File & Project',
      shortcut: 'Ctrl+e',
      handler: () => requestExport('glb')
    },
    {
      id: 'open_help',
      label: 'Documentation & User Manual',
      category: 'File & Project',
      shortcut: 'F1',
      handler: () => {
        window.dispatchEvent(new CustomEvent('open-help', { detail: { topic: 'overview' } }))
      }
    },

    // 8. UV & TEXTURE
    {
      id: 'smart_uv_project',
      label: 'Smart UV Project',
      category: 'UV & Texture',
      shortcut: 'u',
      icon: 'uv-smart',
      handler: () => {
        if (toolStore.appMode === 'uvpaint' && toolStore.uvWorkspaceTab === 'uv') {
          requestSmartUvProject()
          return
        }
        projectStore.performSmartUvProject({
          angleLimitDegrees: toolStore.smartUvAngle,
          marginPixels: toolStore.smartUvMargin
        })
      }
    },
    {
      id: 'mark_seam',
      label: 'Mark Seam (edges or island border)',
      category: 'UV & Texture',
      handler: () => projectStore.markSelectedEdgesAsSeam()
    },
    {
      id: 'clear_seam',
      label: 'Clear Seams (edges or island border)',
      category: 'UV & Texture',
      handler: () => projectStore.clearSelectedEdgesSeam()
    },
    {
      id: 'unwrap_seams',
      label: 'Unwrap UVs Along Seams',
      category: 'UV & Texture',
      handler: () => projectStore.performSeamUnwrap()
    },
    {
      id: 'project_from_view',
      label: 'Project From View',
      category: 'UV & Texture',
      handler: () => requestProjectFromView()
    },
    {
      id: 'seams_from_islands',
      label: 'Seams from UV Islands',
      category: 'UV & Texture',
      handler: () => projectStore.performSeamsFromIslands()
    },
    {
      id: 'pack_islands',
      label: 'Pack UV Islands',
      category: 'UV & Texture',
      handler: () => projectStore.performPackUVIslands()
    },
    {
      id: 'box_unwrap',
      label: 'Box UV Projection',
      category: 'UV & Texture',
      icon: 'mesh-cube',
      handler: () => projectStore.performBoxUnwrap()
    },
    {
      id: 'gridify_uv_quads',
      label: 'Gridify Quad UVs',
      category: 'UV & Texture',
      handler: () => projectStore.performGridifyUvQuads()
    },
    {
      id: 'bake_scene_atlas',
      label: 'Bake Scene Texture Atlas (All Meshes)',
      category: 'UV & Texture',
      handler: () => projectStore.bakeSceneAtlas(2)
    },
    {
      id: 'restore_default_texture',
      label: 'Restore Starter Texture',
      category: 'UV & Texture',
      icon: 'sparkles',
      handler: () => {
        projectStore.restoreDefaultTexture()
      }
    }
  ]

  actionRegistry.registerMany(actions)
}
