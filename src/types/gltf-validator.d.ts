declare module 'gltf-validator' {
  export interface GltfValidatorReport {
    issues: { numErrors: number; numWarnings: number }
  }
  export function validateBytes(bytes: Uint8Array): Promise<GltfValidatorReport>
  const validator: { validateBytes: typeof validateBytes }
  export default validator
}
