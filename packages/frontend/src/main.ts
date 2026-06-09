/**
 * @file 应用入口
 * @description Vue 3 应用入口，注册 Pinia 状态管理和全局样式
 * @module main
 */

// 导入Vue应用创建函数
import { createApp } from 'vue'
// 导入Pinia状态管理
import { createPinia } from 'pinia'
// 导入根组件
import App from './App.vue'
// 导入全局样式变量
import './styles/variables.css'
// 导入 Markdown 渲染样式（段落、列表、引用、代码块等）
import './styles/markdown.css'

// 创建Vue应用实例
const app = createApp(App)

// 创建并注册 Pinia 状态管理
const pinia = createPinia()
app.use(pinia)

// 将Vue应用挂载到DOM中的#app元素
app.mount('#app')
