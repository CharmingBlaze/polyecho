import * as THREE from 'three'

export interface TurntableOptions {
  frames?: number // e.g. 36 frames for full 360 rotation
  fps?: number // e.g. 24 fps
  width?: number
  height?: number
  durationSeconds?: number
}

/**
 * Captures a 360 turntable animation of the 3D canvas and creates a downloadable WebM video or frame pack.
 */
export class TurntableRecorder {
  /**
   * Records a 360 turntable video using Canvas Capture Stream & MediaRecorder.
   */
  static async recordTurntableVideo(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
    options: TurntableOptions = {},
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    const totalFrames = options.frames || 60
    const fps = options.fps || 30
    const canvas = renderer.domElement

    const stream = canvas.captureStream(fps)
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm'
    })

    const chunks: Blob[] = []
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    return new Promise((resolve) => {
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' })
        resolve(blob)
      }

      mediaRecorder.start()

      // Rotate camera around origin
      const camPos = camera.position.clone()
      const radius = Math.hypot(camPos.x, camPos.z)
      const initialAngle = Math.atan2(camPos.z, camPos.x)

      let frame = 0
      const interval = setInterval(() => {
        if (frame >= totalFrames) {
          clearInterval(interval)
          mediaRecorder.stop()
          // Restore camera
          camera.position.copy(camPos)
          camera.lookAt(0, 0, 0)
          renderer.render(scene, camera)
          return
        }

        const angle = initialAngle + (frame / totalFrames) * (Math.PI * 2)
        camera.position.x = Math.cos(angle) * radius
        camera.position.z = Math.sin(angle) * radius
        camera.lookAt(0, 0, 0)

        renderer.render(scene, camera)

        frame++
        if (onProgress) {
          onProgress(frame / totalFrames)
        }
      }, 1000 / fps)
    })
  }
}
