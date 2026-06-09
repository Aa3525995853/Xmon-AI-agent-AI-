/**
 * @file 欢迎页
 * @description 欢迎页组件，显示问候语
 * @module components/chat/WelcomeMsg
 */

<template>
  <div class="welcome-msg">
    <h2>你好，我是小梦</h2>
    <p>不只是聊天，说完就做完</p>
  </div>
</template>

<style scoped>
.welcome-msg {
  width: 100%;
  padding: var(--sp-xl) var(--sp-xxl);
  max-width: 720px;
  margin: 0 auto;
}

.welcome-msg h2 {
  font-family: var(--font-display);
  font-size: 36px;
  font-weight: 400;
  letter-spacing: -0.5px;
  color: var(--text-primary);
  margin-bottom: var(--sp-xs);
  line-height: 1.2;
}

.welcome-msg p {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: var(--sp-xl);
}
</style>
