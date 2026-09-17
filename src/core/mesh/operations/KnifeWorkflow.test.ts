import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { EditableMesh } from '../MeshKernel'
import { MeshBridge } from '../MeshBridge'
import { MeshValidator } from '../MeshValidator'
import { createCube } from '../../geometry/Primitives'
import { ScreenGeometry } from '../../geometry/ScreenGeometry'
import { KnifeKernel, type KnifePoint } from './KnifeKernel'

const camera = new THREE.OrthographicCamera(-2,2,2,-2,0.1,20)
camera.position.z = 5; camera.updateMatrixWorld()
const rect = {left:0,top:0,width:600,height:600}
const point = (x:number,y:number,z=0): KnifePoint => {
  const world = new THREE.Vector3(x,y,z)
  return {world,screen:ScreenGeometry.worldToScreen(world,camera,rect),targetType:'FACE',background:true}
}
describe('Knife cross-face cuts', () => {
  it('keeps concave face cuts inside the surface and interpolates texture coordinates', () => {
    const mesh = new EditableMesh()
    const positions = [[0,0],[3,0],[3,1],[1,1],[1,3],[0,3]].map(([x,y]) => new THREE.Vector3(x,y,0))
    const ids = positions.map(p => mesh.addVertex(p).id)
    const face = mesh.addFace(ids, positions.map(p => new THREE.Vector2(p.x / 3, p.y / 3)))
    mesh.recalculateNormals()
    const cut = KnifeKernel.insertSurfaceVertex(mesh, new THREE.Vector3(0.5,2,0), face!.id)
    let area = 0
    for (const f of mesh.faces.values()) {
      const ps = f.vertexIds.map(id => mesh.vertices.get(id)!.position)
      area += new THREE.Triangle(ps[0], ps[1], ps[2]).getArea()
      expect(f.normal.z).toBeGreaterThan(0)
      const index = f.vertexIds.indexOf(cut)
      if(index >= 0) { expect(f.uvs[index].x).toBeCloseTo(1/6); expect(f.uvs[index].y).toBeCloseTo(2/3) }
    }
    expect(area).toBeCloseTo(5)
    expect(MeshValidator.validate(mesh).valid).toBe(true)
    expect(MeshValidator.validate(mesh).orphanVertices).toEqual([])
  })
  it('cuts across three quads from outside the mesh without loose vertices', () => {
    const mesh = new EditableMesh(), bottom:number[]=[], top:number[]=[]
    for(let i=0;i<4;i++) { bottom.push(mesh.addVertex(new THREE.Vector3(i-1.5,-1,0)).id);top.push(mesh.addVertex(new THREE.Vector3(i-1.5,1,0)).id) }
    for(let i=0;i<3;i++) mesh.addFace([bottom[i],bottom[i+1],top[i+1],top[i]])
    mesh.recalculateNormals()
    KnifeKernel.applyCuts(mesh,[point(-1.8,0),point(1.8,0)],{camera,viewportRect:rect,cutThrough:false})
    expect(mesh.faces.size).toBe(6)
    expect([...mesh.faces.values()].every(f=>f.vertexIds.length===4)).toBe(true)
    expect(MeshValidator.validate(mesh).valid).toBe(true)
    expect(MeshValidator.validate(mesh).orphanVertices).toEqual([])
  })
  for (const through of [false,true]) it(`cuts ${through ? 'front and back' : 'visible faces only'} on a cube`, () => {
    const mesh = MeshBridge.meshObjectToEditableMesh(createCube('cube',2)).mesh
    KnifeKernel.applyCuts(mesh,[point(-1.8,0,1),point(1.8,0,1)],{camera,viewportRect:rect,cutThrough:through})
    expect(mesh.faces.size).toBeGreaterThan(6)
    const backMidpoints = [...mesh.vertices.values()].filter(v=>Math.abs(v.position.z+1)<1e-6 && Math.abs(v.position.y)<1e-6)
    expect(backMidpoints.length).toBe(through ? 2 : 0)
    expect([...mesh.edges.values()].every(e=>e.faceIds.length===2)).toBe(true)
    expect(MeshValidator.validate(mesh).valid).toBe(true)
  })
})
