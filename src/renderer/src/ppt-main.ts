/** PPT 管理窗口入口 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './styles/base.css'
import PptApp from './PptApp.vue'
import { initTheme } from './theme'

const app = createApp(PptApp)
app.use(createPinia())
app.mount('#ppt-app')
void initTheme()
