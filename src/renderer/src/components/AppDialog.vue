<template>
  <Teleport to="body">
    <div v-if="open" class="ad-mask" @mousedown.self="emit('cancel')">
      <div class="ad-card" role="dialog" aria-modal="true">
        <div class="ad-title">{{ title }}</div>
        <p v-if="message" class="ad-msg">{{ message }}</p>

        <input
          v-if="showInput"
          ref="inputEl"
          v-model="model"
          class="input"
          @keydown.enter.prevent="emit('confirm')"
          @keydown.esc.prevent="emit('cancel')"
        />

        <div class="ad-actions">
          <button class="btn btn-ghost" @click="emit('cancel')">{{ cancelLabel }}</button>
          <button
            ref="okEl"
            class="btn"
            :class="danger ? 'btn-danger' : 'btn-primary'"
            @click="emit('confirm')"
          >
            {{ confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * 应用内对话框：替代 window.prompt / window.confirm。
 *
 * Electron 的渲染进程不支持 window.prompt（调用直接抛
 * "prompt() is and will not be supported"），window.confirm 虽能弹出但有
 * "关闭输入框无法再聚焦" 的已知缺陷。故统一改为应用内自绘。
 *
 * 组件本身不持有业务状态：由父组件传入 open / 文案 / 是否带输入框，
 * 监听 confirm / cancel 后自行执行动作，避免用 ref 调方法的隐式耦合。
 */
import { nextTick, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 是否显示 */
    open: boolean
    title: string
    /** 补充说明（删除确认用） */
    message?: string
    /** 是否显示文本输入框（重命名用） */
    showInput?: boolean
    confirmLabel: string
    cancelLabel: string
    /** 确认按钮用危险色（删除用） */
    danger?: boolean
  }>(),
  { message: '', showInput: false, danger: false }
)

const emit = defineEmits<{ (e: 'confirm'): void; (e: 'cancel'): void }>()

/** 输入框内容（重命名时由父组件传入原名称作为初值） */
const model = defineModel<string>({ default: '' })

const inputEl = ref<HTMLInputElement | null>(null)
const okEl = ref<HTMLButtonElement | null>(null)

// 打开后自动聚焦：有输入框则聚焦并全选，否则聚焦确认按钮，键盘即可完成操作
watch(
  () => props.open,
  (visible) => {
    if (!visible) return
    void nextTick(() => {
      if (inputEl.value) {
        inputEl.value.focus()
        inputEl.value.select()
      } else {
        okEl.value?.focus()
      }
    })
  }
)
</script>

<style scoped>
.ad-mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--vd-overlay);
}

.ad-card {
  width: 380px;
  max-width: calc(100vw - 48px);
  padding: 18px 20px 16px;
  background: var(--vd-surface);
  border: 1px solid var(--vd-line);
  border-radius: var(--vd-r-lg);
  box-shadow: var(--vd-shadow-lg);
}

.ad-title { font-size: 15px; font-weight: 700; }
.ad-msg {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--vd-text-2);
  word-break: break-word;
}

.ad-card .input { margin-top: 12px; }

.ad-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}
</style>
