/** 悬浮球入口 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/base.css'
import { initTheme } from './theme'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
void initTheme()
