import { actionRegistry, type CommandAction } from './ActionRegistry'
import { requestExport, requestModalTool, requestPrimitivePlacement, requestCameraView, requestFillFace } from './editorCommands'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import { useAnimationStore } from '../../stores/animationStore'
import { useHistoryStore } from '../../stores/historyStore'
import { ProjectSerializer } from '../project/ProjectSerializer'

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
          projectStore.recordState('Extrude Individual Faces')
          requestModalTool('extrude')
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
      label: 'Bevel Edges / Vertices',
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

    // 2. TOPOLOGY
    {
      id: 'subdivide',
      label: 'Subdivide Mesh',
      category: 'Topology',
      shortcut: 'w',
      icon: 'subdivide',
      handler: () => {
        if (projectStore.activeMesh) {
          projectStore.performSubdivide()
        }
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

    // 3. SELECTION
    {
      id: 'select_all',
      label: 'Select All',
      category: 'Selection',
      shortcut: 'a',
      handler: () => projectStore.selectAll()
    },
    {
      id: 'deselect_all',
      label: 'Deselect All',
      category: 'Selection',
      shortcut: 'Alt+a',
      handler: () => projectStore.deselectAll()
    },
    {
      id: 'box_select',
      label: 'Box Select (Marquee)',
      category: 'Selection',
      shortcut: 'b',
      icon: 'marquee',
      handler: () => { toolStore.isBoxSelectActive = true }
    },
    {
      id: 'mode_vertex',
      label: 'Vertex Mode',
      category: 'Selection',
      shortcut: '1',
      icon: 'vertex-select',
      handler: () => { toolStore.selectMode = 'vertex'; toolStore.setAppMode('model') }
    },
    {
      id: 'mode_edge',
      label: 'Edge Mode',
      category: 'Selection',
      shortcut: '2',
      icon: 'edge-select',
      handler: () => { toolStore.selectMode = 'edge'; toolStore.setAppMode('model') }
    },
    {
      id: 'mode_face',
      label: 'Face Mode',
      category: 'Selection',
      shortcut: '3',
      icon: 'face-select',
      handler: () => { toolStore.selectMode = 'face'; toolStore.setAppMode('model') }
    },
    {
      id: 'mode_object',
      label: 'Object Mode',
      category: 'Selection',
      shortcut: '4',
      icon: 'mesh-cube',
      handler: () => { toolStore.selectMode = 'object'; toolStore.setAppMode('model') }
    },
    {
      id: 'mode_origin',
      label: 'Origin / Pivot Mode',
      category: 'Selection',
      shortcut: '5',
      handler: () => { toolStore.selectMode = 'origin'; toolStore.setAppMode('model') }
    },
    {
      id: 'mode_bone',
      label: 'Bone Selection Mode',
      category: 'Selection',
      shortcut: '6',
      icon: 'bone',
      handler: () => { toolStore.selectMode = 'bone'; toolStore.setAppMode('rig') }
    },
    {
      id: 'toggle_edit_object',
      label: 'Toggle Edit/Object Mode',
      category: 'Selection',
      shortcut: 'Tab',
      handler: () => {
        if (toolStore.selectMode === 'object') {
          toolStore.selectMode = 'face'
        } else {
          toolStore.selectMode = 'object'
        }
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
      id: 'toggle_xray',
      label: 'Toggle X-Ray Mode',
      category: 'Viewport',
      shortcut: 'Alt+z',
      icon: 'xray',
      handler: () => { toolStore.viewport.xray = !toolStore.viewport.xray }
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
        const jsonStr = ProjectSerializer.serialize(
          projectStore.projectName,
          projectStore.meshes,
          projectStore.pixelBuffer.canvas,
          projectStore.activePalette,
          projectStore.materials,
          animationStore.armature,
          animationStore.armature.clips,
          animationStore.armature.activeClipId,
          animationStore.currentFrame,
          toolStore.viewport,
          projectStore.textures,
          projectStore.referenceImages
        )
        ProjectSerializer.downloadProject(jsonStr, projectStore.projectName || 'PSX_Model')
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

    // 8. UV & TEXTURE
    {
      id: 'mark_seam',
      label: 'Mark Seam on Selected Edges',
      category: 'UV & Texture',
      handler: () => projectStore.markSelectedEdgesAsSeam()
    },
    {
      id: 'clear_seam',
      label: 'Clear Seams on Selected Edges',
      category: 'UV & Texture',
      handler: () => projectStore.clearSelectedEdgesSeam()
    },
    {
      id: 'unwrap_seams',
      label: 'Unwrap UVs Along Seams',
      category: 'UV & Texture',
      shortcut: 'u',
      handler: () => projectStore.performSeamUnwrap()
    },
    {
      id: 'pack_islands',
      label: 'Pack UV Islands',
      category: 'UV & Texture',
      handler: () => projectStore.performPackUVIslands()
    },
    {
      id: 'bake_scene_atlas',
      label: 'Bake Scene Texture Atlas (All Meshes)',
      category: 'UV & Texture',
      handler: () => projectStore.bakeSceneAtlas(2)
    },
    {
      id: 'restore_default_texture',
      label: 'Restore Default Texture Atlas (64x64 Retro)',
      category: 'UV & Texture',
      icon: 'sparkles',
      handler: () => {
        projectStore.restoreDefaultTexture()
      }
    }
  ]

  actionRegistry.registerMany(actions)
}
