import { Bone, SpringConstraint } from '../../types/animation'
import { Vector3D } from '../../types/mesh'

interface BoneSpringState {
  currentRot: Vector3D
  rotVelocity: Vector3D
}

export class SpringPhysicsSolver {
  private static states = new Map<string, BoneSpringState>()

  /**
   * Resets all spring simulation states.
   */
  static reset() {
    this.states.clear()
  }

  /**
   * Evaluates dynamic spring / jiggle physics for all bones with springConstraint enabled.
   * Modifies bone rotation in place to simulate dynamic lag and bounce.
   */
  static step(bones: Bone[], dt = 1 / 60) {
    const clampedDt = Math.min(0.05, Math.max(0.001, dt))

    for (const bone of bones) {
      const spring: SpringConstraint | undefined = bone.springConstraint
      if (!spring || !spring.enabled) continue

      let state = this.states.get(bone.id)
      if (!state) {
        state = {
          currentRot: { ...bone.rotation },
          rotVelocity: { x: 0, y: 0, z: 0 }
        }
        this.states.set(bone.id, state)
      }

      const stiffness = (spring.stiffness ?? 0.3) * 120
      const damping = (spring.damping ?? 0.25) * 25
      const gravity = (spring.gravity ?? 0.0) * 15

      // Target rotation from animation/rest pose
      const targetX = bone.rotation.x + gravity
      const targetY = bone.rotation.y
      const targetZ = bone.rotation.z

      // Spring displacement
      const dispX = targetX - state.currentRot.x
      const dispY = targetY - state.currentRot.y
      const dispZ = targetZ - state.currentRot.z

      // Spring acceleration: Hooke's Law + viscous damping
      const accX = dispX * stiffness - state.rotVelocity.x * damping
      const accY = dispY * stiffness - state.rotVelocity.y * damping
      const accZ = dispZ * stiffness - state.rotVelocity.z * damping

      state.rotVelocity.x += accX * clampedDt
      state.rotVelocity.y += accY * clampedDt
      state.rotVelocity.z += accZ * clampedDt

      state.currentRot.x += state.rotVelocity.x * clampedDt
      state.currentRot.y += state.rotVelocity.y * clampedDt
      state.currentRot.z += state.rotVelocity.z * clampedDt

      // Clamp max velocity to prevent physics explosions
      const maxVel = 500
      state.rotVelocity.x = Math.max(-maxVel, Math.min(maxVel, state.rotVelocity.x))
      state.rotVelocity.y = Math.max(-maxVel, Math.min(maxVel, state.rotVelocity.y))
      state.rotVelocity.z = Math.max(-maxVel, Math.min(maxVel, state.rotVelocity.z))

      // Apply dynamic spring rotation
      bone.rotation.x = Number(state.currentRot.x.toFixed(2))
      bone.rotation.y = Number(state.currentRot.y.toFixed(2))
      bone.rotation.z = Number(state.currentRot.z.toFixed(2))
    }
  }
}
