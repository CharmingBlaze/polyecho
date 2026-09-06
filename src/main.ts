import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import { useRuntimeStore } from './stores/runtimeStore'
import { isDesktopApp, setDesktopTitle } from './core/desktop/desktopApi'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

app.config.errorHandler = (err, _instance, info) => {
  useRuntimeStore(pinia).reportError(err, info || 'vue')
}

window.addEventListener('unhandledrejection', (event) => {
  useRuntimeStore(pinia).reportError(event.reason, 'unhandledrejection')
})

window.addEventListener('error', (event) => {
  useRuntimeStore(pinia).reportError(event.error || event.message, 'window')
})

if (isDesktopApp()) {
  document.documentElement.classList.add('desktop')
  void setDesktopTitle('PolyEcho')
}

app.mount('#app')
