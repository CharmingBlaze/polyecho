import * as THREE from 'three'

export class SnapManager {
  private precisionAnchorValue = 0
  private precisionAnchorMouse = 0
  private isPrecisionActive = false

  beginPrecision(currentValue: number, currentMouse: number) {
    this.precisionAnchorValue = currentValue
    this.precisionAnchorMouse = currentMouse
    this.isPrecisionActive = true
  }

  endPrecision() {
    this.isPrecisionActive = false
  }

  getPrecisionDelta(currentMouse: number, sensitivity = 0.2): number {
    if (!this.isPrecisionActive) return 0
    return (currentMouse - this.precisionAnchorMouse) * sensitivity
  }

  getPrecisionValue(currentMouse: number, sensitivity = 0.2): number {
    return this.precisionAnchorValue + this.getPrecisionDelta(currentMouse, sensitivity)
  }

  snapLinear(value: number, step = 0.5): number {
    return Math.round(value / step) * step
  }

  snapAngle(degrees: number, stepDeg = 5): number {
    return Math.round(degrees / stepDeg) * stepDeg
  }

  snapScale(factor: number, step = 0.1): number {
    return Math.round(factor / step) * step
  }

  /**
   * Rigid offset so the closest moving point lands on a snap target
   * (Blockbench vertex-snap / Blender vertex snap).
   */
  static findRigidSnapOffset(
    moving: THREE.Vector3[],
    targets: THREE.Vector3[],
    threshold: number
  ): THREE.Vector3 | null {
    let best = threshold
    let offset: THREE.Vector3 | null = null
    for (const p of moving) {
      for (const t of targets) {
        const d = p.distanceTo(t)
        if (d < best) {
          best = d
          offset = t.clone().sub(p)
        }
      }
    }
    return offset
  }

  findRigidSnapOffset(
    moving: THREE.Vector3[],
    targets: THREE.Vector3[],
    threshold: number
  ): THREE.Vector3 | null {
    return SnapManager.findRigidSnapOffset(moving, targets, threshold)
  }
}
