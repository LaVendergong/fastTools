<template>
  <div class="tool-loading">
    <span class="spinner" />
    <span class="text">加载中…</span>
  </div>
</template>

<style scoped>
.tool-loading {
  height: 100%;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--border-strong);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
.text {
  font-size: 11px;
  color: var(--text-faint);
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
