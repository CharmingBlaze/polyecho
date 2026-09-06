import { ProjectSerializer } from './ProjectSerializer'
import { useProjectStore } from '../../stores/projectStore'
import { useAnimationStore } from '../../stores/animationStore'
import { useToolStore } from '../../stores/toolStore'
import { addRecentProject, getLastProjectPath, saveTextDocument, setLastProjectPath, setDesktopTitle } from '../desktop/desktopApi'
import { useHistoryStore } from '../../stores/historyStore'

export function serializeOpenProject(): string {
  const projectStore = useProjectStore()
  const animationStore = useAnimationStore()
  const toolStore = useToolStore()
  return ProjectSerializer.serialize(
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
}

export async function saveOpenProject(options?: { saveAs?: boolean }): Promise<string | null> {
  const projectStore = useProjectStore()
  const suggested = `${projectStore.projectName || 'PSX_Model'}.psxproj`
  const overwrite = options?.saveAs ? null : getLastProjectPath()
  const saved = await saveTextDocument(
    serializeOpenProject(),
    suggested,
    [{ name: 'PolyEcho Project', extensions: ['psxproj'] }],
    overwrite
  )
  if (saved) {
    setLastProjectPath(saved)
    await addRecentProject(saved)
    useHistoryStore().markClean()
    await refreshDesktopTitle()
  }
  return saved
}

export async function loadOpenProject(text: string, filePath?: string | null): Promise<void> {
  const projectStore = useProjectStore()
  const animationStore = useAnimationStore()
  const historyStore = useHistoryStore()
  const proj = ProjectSerializer.deserialize(text)
  projectStore.projectName = proj.projectName || 'Project'
  projectStore.meshes = proj.meshes || []
  if (proj.materials) projectStore.materials = proj.materials
  if (proj.activePalette) projectStore.activePalette = proj.activePalette
  if (proj.referenceImages) projectStore.referenceImages = proj.referenceImages
  if (proj.armature) animationStore.armature = proj.armature
  if (proj.animations) animationStore.armature.clips = proj.animations
  if (proj.textures && proj.textures.length > 0) {
    projectStore.textures = []
    for (const t of proj.textures) {
      projectStore.createTexture(t.name, t.width, t.height, t.dataUrl, undefined, { record: false, select: false, atlas: t.atlas })
    }
  }
  projectStore.markGeometryUpdated()
  historyStore.clearHistory()
  historyStore.markClean()
  if (filePath) {
    setLastProjectPath(filePath)
    await addRecentProject(filePath)
  }
  await refreshDesktopTitle()
}

export async function refreshDesktopTitle(): Promise<void> {
  const projectStore = useProjectStore()
  const dirty = useHistoryStore().isDirty()
  const name = projectStore.projectName || 'Untitled'
  await setDesktopTitle(dirty ? `PolyEcho — ${name} *` : `PolyEcho — ${name}`)
}
