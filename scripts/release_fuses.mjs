import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { flipFuses, FuseVersion, FuseV1Options } from '@electron/fuses'

const require = createRequire(import.meta.url)
const { readAsarHeader } = require('app-builder-lib/out/asar/asar.js')

const [cmd, file] = process.argv.slice(2)
if (cmd === 'hash') {
  const { header } = await readAsarHeader(file)
  process.stdout.write(createHash('sha256').update(header).digest('hex'))
} else if (cmd === 'flip') {
  await flipFuses(file, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: false,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: true
  })
} else {
  console.error('usage: release_fuses.mjs hash <app.asar> | flip <electron-binary>')
  process.exit(1)
}
