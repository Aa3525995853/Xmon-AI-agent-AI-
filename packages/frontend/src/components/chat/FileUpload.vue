/**
 * @file 文件上传
 * @description 文件上传组件，支持图片/文档拖拽上传和粘贴上传
 * @module components/chat/FileUpload
 */

<template>
  <div class="file-upload-area">
    <!-- 图片预览条 -->
    <div v-if="pendingImage" class="image-preview-bar">
      <img :src="imagePreviewUrl" class="preview-thumb" alt="预览" />
      <span class="preview-info">{{ pendingImage.name }}</span>
      <button class="preview-remove" @click="clearImage" title="移除图片">✕</button>
    </div>

    <!-- 隐藏的文件输入 -->
    <input
      ref="imageInputRef"
      type="file"
      accept="image/*"
      class="hidden-input"
      @change="handleImageSelect"
    />
    <input
      ref="codeInputRef"
      type="file"
      accept=".js,.ts,.py,.html,.css,.json,.md,.txt,.vue,.jsx,.tsx,.go,.java,.c,.cpp,.cs,.rb,.php,.sql,.sh,.yaml,.yml,.xml"
      class="hidden-input"
      @change="handleCodeSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue' // 导入Vue响应式API

/** 组件事件定义 */
const emit = defineEmits<{
  (e: 'imageSelected', image: { base64: string; mimeType: string; name: string }): void // 图片已选择事件
  (e: 'imageCleared'): void // 图片已清除事件
  (e: 'codeSelected', code: string, extension: string): void // 代码文件已选择事件
}>()

/** 待发送的图片数据 */
const pendingImage = ref<{ base64: string; mimeType: string; name: string } | null>(null)
/** 图片文件输入框DOM引用 */
const imageInputRef = ref<HTMLInputElement | null>(null)
/** 代码文件输入框DOM引用 */
const codeInputRef = ref<HTMLInputElement | null>(null)

/** 计算图片预览的data URL */
const imagePreviewUrl = computed(() => {
  if (!pendingImage.value) return '' // 没有图片时返回空
  return `data:${pendingImage.value.mimeType};base64,${pendingImage.value.base64}` // 拼接base64格式的data URL
})

/**
 * 打开图片选择对话框
 */
function openImagePicker() {
  imageInputRef.value?.click() // 触发隐藏的文件输入框点击
}

/**
 * 打开代码文件选择对话框
 */
function openCodePicker() {
  codeInputRef.value?.click() // 触发隐藏的代码文件输入框点击
}

/**
 * 处理图片文件选择
 * @param e - 输入框change事件
 */
function handleImageSelect(e: Event) {
  const input = e.target as HTMLInputElement // 获取输入框元素
  if (!input.files?.length) return // 没有选择文件时直接返回

  const file = input.files[0] // 获取第一个选中的文件
  if (!file.type.startsWith('image/')) return // 不是图片类型时返回
  if (file.size > 10 * 1024 * 1024) { // 检查文件大小不超过10MB
    alert('图片不能超过10MB')
    return
  }

  const reader = new FileReader() // 创建文件读取器
  reader.onload = (ev) => { // 文件读取完成回调
    const base64 = (ev.target?.result as string).split(',')[1] // 提取base64数据部分
    pendingImage.value = { base64, mimeType: file.type, name: file.name } // 保存图片数据
    emit('imageSelected', pendingImage.value) // 触发图片选择事件
  }
  reader.readAsDataURL(file) // 开始读取文件为DataURL
  input.value = '' // 重置输入框，允许重复选择同一文件
}

/**
 * 处理代码文件选择
 * @param e - 输入框change事件
 */
async function handleCodeSelect(e: Event) {
  const input = e.target as HTMLInputElement // 获取输入框元素
  if (!input.files?.length) return // 没有选择文件时返回

  const file = input.files[0] // 获取第一个选中的文件
  try {
    const content = await file.text() // 读取文件内容为文本
    const extension = file.name.split('.').pop()?.toUpperCase() || 'TXT' // 获取文件扩展名并转为大写
    emit('codeSelected', content, extension) // 触发代码选择事件
  } catch {
    alert('读取文件失败') // 读取失败提示
  }
  input.value = '' // 重置输入框
}

/**
 * 处理文件拖拽事件
 * @param e - 拖拽事件
 */
function handleDrop(e: DragEvent) {
  e.preventDefault() // 阻止默认的拖拽行为
  if (!e.dataTransfer?.files.length) return // 没有拖拽文件时返回

  const files = Array.from(e.dataTransfer.files) // 将文件列表转为数组
  const imageFile = files.find(f => f.type.startsWith('image/')) // 查找图片文件
  const codeFile = files.find(f => // 查找代码文件
    /\.(js|ts|py|html|css|json|md|txt|vue|jsx|tsx|go|java|c|cpp|cs|rb|php|sql|sh|yaml|yml|xml)$/i.test(f.name)
  )

  if (imageFile) { // 如果是图片文件
    const dt = new DataTransfer() // 创建数据传输对象
    dt.items.add(imageFile) // 添加图片文件
    if (imageInputRef.value) { // 设置到图片输入框
      imageInputRef.value.files = dt.files
      imageInputRef.value.dispatchEvent(new Event('change')) // 触发change事件
    }
  } else if (codeFile) { // 如果是代码文件
    codeFile.text().then(content => { // 读取文件内容
      const extension = codeFile.name.split('.').pop()?.toUpperCase() || 'TXT' // 获取扩展名
      emit('codeSelected', content, extension) // 触发代码选择事件
    })
  }
}

/**
 * 处理粘贴事件（支持粘贴图片）
 * @param e - 粘贴事件
 */
function handlePaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items // 获取剪贴板内容项
  if (!items) return // 没有内容时返回

  for (const item of items) { // 遍历所有剪贴板项
    if (item.type.startsWith('image/')) { // 如果是图片类型
      e.preventDefault() // 阻止默认粘贴行为
      const file = item.getAsFile() // 获取粘贴的图片文件
      if (!file) continue // 获取失败继续检查下一项

      const reader = new FileReader() // 创建文件读取器
      reader.onload = (ev) => { // 读取完成回调
        const base64 = (ev.target?.result as string).split(',')[1] // 提取base64数据
        pendingImage.value = { base64, mimeType: file.type, name: '粘贴的图片' } // 保存图片数据
        emit('imageSelected', pendingImage.value) // 触发图片选择事件
      }
      reader.readAsDataURL(file) // 读取文件为DataURL
      break // 只处理第一张图片
    }
  }
}

/**
 * 清除待发送的图片
 */
function clearImage() {
  pendingImage.value = null // 清空图片数据
  emit('imageCleared') // 触发图片清除事件
}

/** 暴露给父组件的方法和属性 */
defineExpose({
  openImagePicker, // 打开图片选择器
  openCodePicker, // 打开代码文件选择器
  handleDrop, // 处理文件拖拽
  handlePaste, // 处理粘贴
  clearImage, // 清除图片
  pendingImage // 当前待发送图片
})
</script>

<style scoped>
.file-upload-area {
  display: contents;
}

.image-preview-bar {
  display: flex;
  align-items: center;
  gap: var(--sp-sm);
  padding: var(--sp-xs) var(--sp-md);
  background: var(--surface-soft);
  border-radius: var(--radius-md);
  margin: 0 var(--sp-lg) var(--sp-xs);
}

.preview-thumb {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: var(--radius-sm);
}

.preview-info {
  flex: 1;
  font-size: 13px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-remove {
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 14px;
  padding: 4px;
}

.preview-remove:hover {
  color: var(--accent-coral);
}

.hidden-input {
  display: none;
}
</style>
