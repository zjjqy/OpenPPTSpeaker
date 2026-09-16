/** 设置窗口入口 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './styles/base.css'
import SettingsApp from './SettingsApp.vue'
import { initTheme } from './theme'

const app = createApp(SettingsApp)
app.use(createPinia())
app.mount('#settings-app')
void initTheme()
