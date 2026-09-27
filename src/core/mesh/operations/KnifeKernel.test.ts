import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createCube } from '../../geometry/Primitives'
import { ScreenGeometry } from '../../geometry/ScreenGeometry'
import { MeshBridge } from '../MeshBridge'
import { KnifeKernel } from './KnifeKernel'
import { KnifeOperator } from '../../operators/knife/KnifeOperator'

describe('KnifeKernel screen follow', () => {
  it('snaps overlay angles around the last point without changing distance', () => {
    const from = new THREE.Vector2(100, 100)
    const to = new THREE.Vector2(140, 105)
    const snapped = KnifeKernel.snapScreenToAngle(from, to, 45)
    const angle = Math.atan2(snapped.y - from.y, snapped.x - from.x)
    expect(Math.abs(angle) < 1e-6 || Math.abs(Math.abs(angle) - Math.PI / 4) < 1e-6).toBe(true)
    expect(snapped.distanceTo(from)).toBeCloseTo(to.distanceTo(from), 4)
  })
})

describe('KnifeKernel on arbitrary faces', () => {
  it('cuts two interior points on a quad into quads', () => {
    const { mesh } = MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2))
    const top = [...mesh.faces.values()].find((f) =>
      f.vertexIds.every((id) => (mesh.vertices.get(id)?.position.y ?? 0) > 0.5)
    )
    expect(top).toBeTruthy()
    const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 20)
    camera.position.set(0, 5, 0)
    camera.up.set(0, 0, -1)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    const rect = { left: 0, top: 0, width: 600, height: 600 }
    const stroke = (world: THREE.Vector3) => ({
      world,
      screen: ScreenGeometry.worldToScreen(world, camera, rect),
      targetType: 'FACE' as const,
      faceId: top!.id,
    })
    KnifeKernel.applyCuts(
      mesh,
      [stroke(new THREE.Vector3(0, 1, 0.35)), stroke(new THREE.Vector3(0, 1, -0.35))],
      { cutThrough: false, camera, viewportRect: rect }
    )
    expect(mesh.faces.size).toBe(7)
    expect(mesh.vertices.size).toBe(10)
    for (const face of mesh.faces.values()) {
      expect(face.vertexIds.length).toBeGreaterThanOrEqual(4)
      expect(face.uvs.length).toBe(face.vertexIds.length)
    }
    const topFaces = [...mesh.faces.values()].filter(face =>
      face.vertexIds.every(id => (mesh.vertices.get(id)?.position.y ?? 0) > 0.5)
    )
    expect(topFaces).toHaveLength(2)
    for (const face of topFaces) expect(face.vertexIds.length).toBe(4)
  })

  it('keeps quads for an off-centre point on a large face instead of fanning triangles', () => {
    const { mesh } = MeshBridge.meshObjectToEditableMesh(createCube('Cube', 10))
    const top = [...mesh.faces.values()].find((f) =>
      f.vertexIds.every((id) => (mesh.vertices.get(id)?.position.y ?? 0) > 4)
    )!
    const point = new THREE.Vector3(3.5, 5, 3)
    const id = KnifeKernel.insertSurfaceVertex(mesh, point, top.id)
    expect(id).not.toBeNull()
    expect(mesh.faces.size).toBe(7)
    const topFaces = [...mesh.faces.values()].filter((face) =>
      face.vertexIds.every((vid) => (mesh.vertices.get(vid)?.position.y ?? 0) > 4)
    )
    expect(topFaces).toHaveLength(2)
    for (const face of topFaces) expect(face.vertexIds.length).toBe(4)
    for (const face of mesh.faces.values()) expect(face.vertexIds.length).toBeGreaterThanOrEqual(4)
    expect([...mesh.edges.values()].some((edge) => {
      const a = mesh.vertices.get(edge.v1)!.position
      const b = mesh.vertices.get(edge.v2)!.position
      const ab = b.clone().sub(a)
      const t = THREE.MathUtils.clamp(point.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1)
      return a.clone().lerp(b, t).distanceTo(point) < 1e-3
    })).toBe(true)
  })

  it('splits a quad near a corner into two quads instead of a triangle fan', () => {
    const { mesh } = MeshBridge.meshObjectToEditableMesh(createCube('Cube', 10))
    const top = [...mesh.faces.values()].find((f) =>
      f.vertexIds.every((id) => (mesh.vertices.get(id)?.position.y ?? 0) > 4)
    )!
    const id = KnifeKernel.insertSurfaceVertex(mesh, new THREE.Vector3(4.2, 5, 4.2), top.id)
    expect(id).not.toBeNull()
    expect(mesh.faces.size).toBe(7)
    const topFaces = [...mesh.faces.values()].filter((face) =>
      face.vertexIds.every((vid) => (mesh.vertices.get(vid)?.position.y ?? 0) > 4)
    )
    expect(topFaces).toHaveLength(2)
    for (const face of topFaces) expect(face.vertexIds.length).toBe(4)
    for (const face of mesh.faces.values()) expect(face.vertexIds.length).toBeGreaterThanOrEqual(4)
  })

  it('applies two snaps on one edge before that edge is replaced', () => {
    const { mesh } = MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2))
    const edge = [...mesh.edges.values()].find((e) => {
      const a = mesh.vertices.get(e.v1)!.position
      const b = mesh.vertices.get(e.v2)!.position
      return Math.abs(a.y - 1) < 1e-6 && Math.abs(b.y - 1) < 1e-6 && Math.abs(a.z - b.z) < 1e-6
    })!
    const snap = (t: number) => ({
      world: new THREE.Vector3(0, 1, 0),
      screen: new THREE.Vector2(t * 10, 0),
      targetType: 'EDGE' as const,
      edgeId: edge.id,
      edgeT: t,
    })
    KnifeKernel.applyCuts(mesh, [snap(0.25), snap(0.75)], {
      cutThrough: false,
      camera: new THREE.PerspectiveCamera(),
      viewportRect: { left: 0, top: 0, width: 100, height: 100 },
    })
    expect(mesh.vertices.size).toBe(10)
    expect(mesh.faces.size).toBe(6)
    for (const face of mesh.faces.values()) expect(face.vertexIds.length).toBeGreaterThanOrEqual(4)
    const a = mesh.vertices.get(edge.v1)!.position
    const b = mesh.vertices.get(edge.v2)!.position
    for (const t of [0.25, 0.75]) {
      const at = a.clone().lerp(b, t)
      expect([...mesh.vertices.values()].some((v) => v.position.distanceTo(at) < 1e-4)).toBe(true)
    }
  })

  it('supports multi-chain cutting across different faces in one call', () => {
    const { mesh } = MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2))
    const faces = [...mesh.faces.values()]
    const f1 = faces[0]!
    const f2 = faces[1]!
    const beforeFaces = mesh.faces.size

    KnifeKernel.applyCuts(
      mesh,
      [
        // Chain 1 on Face 1
        [
          { world: new THREE.Vector3(0, 1, 0.4), screen: new THREE.Vector2(0, 0), targetType: 'FACE', faceId: f1.id },
          { world: new THREE.Vector3(0, 1, -0.4), screen: new THREE.Vector2(10, 0), targetType: 'FACE', faceId: f1.id },
        ],
        // Chain 2 on Face 2
        [
          { world: new THREE.Vector3(0, -1, 0.4), screen: new THREE.Vector2(0, 0), targetType: 'FACE', faceId: f2.id },
          { world: new THREE.Vector3(0, -1, -0.4), screen: new THREE.Vector2(10, 0), targetType: 'FACE', faceId: f2.id },
        ],
      ],
      {
        cutThrough: false,
        camera: new THREE.PerspectiveCamera(),
        viewportRect: { left: 0, top: 0, width: 100, height: 100 },
      }
    )

    expect(mesh.faces.size).toBe(beforeFaces + 2)
    for (const face of mesh.faces.values()) expect(face.vertexIds.length).toBeGreaterThanOrEqual(4)
  })
})

describe('KnifeOperator workflow and Blender parity', () => {
  it('supports newCut (E key) to finalize a stroke and keep completed chains', () => {
    const op = new KnifeOperator()
    const { mesh } = MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2))
    const camera = new THREE.PerspectiveCamera()
    const el = document.createElement('div')

    op.begin({
      mesh,
      selectedVertIds: [],
      selectedFaceIds: [],
      selectedEdgeIds: [],
      selectedMeshIds: [],
      isObjectMode: false,
      camera,
      viewportElement: el,
      pivotMode: 'MEDIAN',
      onUpdatePreview: () => {},
      onCommit: () => {},
      onCancel: () => {},
    }, { x: 100, y: 100 })

    // Add 2 points to active chain
    op.currentChain.push(
      { world: new THREE.Vector3(0, 1, 0), screen: new THREE.Vector2(100, 100), targetType: 'FACE' },
      { world: new THREE.Vector3(0, 1, 1), screen: new THREE.Vector2(120, 100), targetType: 'FACE' }
    )
    expect(op.currentChain.length).toBe(2)

    // Press 'e' (new cut)
    const newCutHandled = op.keyDown(new KeyboardEvent('keydown', { key: 'e' }))
    expect(newCutHandled).toBe(true)
    expect(op.completedChains.length).toBe(1)
    expect(op.currentChain.length).toBe(0)

    // Undo should restore chain
    op.undoPoint()
    expect(op.completedChains.length).toBe(0)
    expect(op.currentChain.length).toBe(2)
  })

  it('toggles angle snapping and cut through with A and C keys', () => {
    const op = new KnifeOperator()
    const { mesh } = MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2))
    const camera = new THREE.PerspectiveCamera()
    const el = document.createElement('div')

    op.begin({
      mesh,
      selectedVertIds: [],
      selectedFaceIds: [],
      selectedEdgeIds: [],
      selectedMeshIds: [],
      isObjectMode: false,
      camera,
      viewportElement: el,
      pivotMode: 'MEDIAN',
      onUpdatePreview: () => {},
      onCommit: () => {},
      onCancel: () => {},
    }, { x: 100, y: 100 })

    expect(op.cutThrough).toBe(false)
    op.keyDown(new KeyboardEvent('keydown', { key: 'c' }))
    expect(op.cutThrough).toBe(true)

    expect(op.angleSnapping).toBe(false)
    op.keyDown(new KeyboardEvent('keydown', { key: 'a' }))
    expect(op.angleSnapping).toBe(true)
  })

  it('crosses from one face to the next through one shared vertex, from real pointer clicks', () => {
    const op = new KnifeOperator()
    const { mesh } = MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2))
    const rect = { left: 0, top: 0, width: 800, height: 600 }
    const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 100)
    camera.position.set(4, 4, 5)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    const el = document.createElement('div')
    el.getBoundingClientRect = () => ({ ...rect, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) })
    Object.defineProperty(el, 'clientWidth', { value: 800 })
    Object.defineProperty(el, 'clientHeight', { value: 600 })
    op.begin({
      mesh, selectedVertIds: [], selectedFaceIds: [], selectedEdgeIds: [], selectedMeshIds: [],
      isObjectMode: false, camera, viewportElement: el, pivotMode: 'MEDIAN',
      onUpdatePreview: () => {}, onCommit: () => {}, onCancel: () => {},
    }, { x: 400, y: 300 })
    const click = (world: THREE.Vector3) => {
      const s = ScreenGeometry.worldToScreen(world, camera, rect)
      op.pointerMove(new PointerEvent('pointermove', { clientX: s.x, clientY: s.y }))
      expect(op.currentHoverPoint?.targetType).toBe('FACE')
      op.handlePointerDown(0)
    }
    click(new THREE.Vector3(-0.3, 1, -0.5))
    click(new THREE.Vector3(-0.3, 0.3, 1))
    op.evaluate()
    expect(op.error).toBe('')

    const topFaces = [...mesh.faces.values()].filter(face =>
      face.vertexIds.every(id => Math.abs(mesh.vertices.get(id)!.position.y - 1) < 1e-6))
    expect(topFaces).toHaveLength(2)
    for (const face of topFaces) expect(face.vertexIds).toHaveLength(4)
    // Every cut vertex sits on an original cube edge: no click vertex inside a face, no sliver pair.
    const onCubeEdge = (p: THREE.Vector3) => [p.x, p.y, p.z].filter(c => Math.abs(Math.abs(c) - 1) < 1e-6).length >= 2
    const verts = [...mesh.vertices.values()].map(v => v.position)
    expect(verts.every(onCubeEdge)).toBe(true)
    for (let i = 0; i < verts.length; i++) {
      for (let j = i + 1; j < verts.length; j++) expect(verts[i]!.distanceTo(verts[j]!)).toBeGreaterThan(1e-3)
    }
    expect(mesh.vertices.size).toBe(11)
    expect(mesh.faces.size).toBe(8)
  })

  it('cuts where the edge snap says, even when the stored position sits inside the face', () => {
    const op = new KnifeOperator()
    const { mesh } = MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2))
    const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 20)
    camera.position.set(0, 5, 0)
    camera.up.set(0, 0, -1)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    const el = document.createElement('div')
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 600, right: 600, bottom: 600, x: 0, y: 0, toJSON: () => ({}) })
    op.begin({
      mesh,
      selectedVertIds: [],
      selectedFaceIds: [],
      selectedEdgeIds: [],
      selectedMeshIds: [],
      isObjectMode: false,
      camera,
      viewportElement: el,
      pivotMode: 'MEDIAN',
      onUpdatePreview: () => {},
      onCommit: () => {},
      onCancel: () => {},
    }, { x: 300, y: 300 })

    const topEdges = [...mesh.edges.values()].filter((e) => {
      const a = mesh.vertices.get(e.v1)!.position
      const b = mesh.vertices.get(e.v2)!.position
      return Math.abs(a.y - 1) < 1e-6 && Math.abs(b.y - 1) < 1e-6 && Math.abs(a.z - b.z) < 1e-6
    })
    expect(topEdges).toHaveLength(2)
    const x = -0.4
    op.currentChain = topEdges.map((edge) => {
      const a = mesh.vertices.get(edge.v1)!.position
      const b = mesh.vertices.get(edge.v2)!.position
      const edgeT = (x - a.x) / (b.x - a.x)
      const onEdge = a.clone().lerp(b, edgeT)
      return {
        world: new THREE.Vector3(0, 1, 0),
        screen: ScreenGeometry.worldToScreen(onEdge, camera, { left: 0, top: 0, width: 600, height: 600 }),
        targetType: 'EDGE' as const,
        edgeId: edge.id,
        edgeT,
      }
    })
    op.evaluate()
    op.evaluate()
    expect(op.error).toBe('')
    expect(mesh.faces.size).toBe(7)
    const topFaces = [...mesh.faces.values()].filter((face) =>
      face.vertexIds.every((vid) => (mesh.vertices.get(vid)?.position.y ?? 0) > 0.5)
    )
    expect(topFaces).toHaveLength(2)
    for (const face of topFaces) expect(face.vertexIds.length).toBe(4)
    for (const face of mesh.faces.values()) expect(face.vertexIds.length).toBeGreaterThanOrEqual(4)
    for (const z of [1, -1]) {
      expect([...mesh.vertices.values()].some((v) => v.position.distanceTo(new THREE.Vector3(x, 1, z)) < 1e-4)).toBe(true)
    }
  })
})


