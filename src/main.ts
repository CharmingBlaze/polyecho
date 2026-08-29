import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'dockview-vue/dist/styles/dockview.css'
import './style.css'
import App from './App.vue'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
