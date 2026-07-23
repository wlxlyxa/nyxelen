<template>
  <div class="activation-page">
    <h2>软件激活</h2>
    <div class="machine-code">
      <label>机器码：</label>
      <code>{{ machineCode }}</code>
      <button @click="copyCode">复制</button>
    </div>
    <input v-model="licenseKey" placeholder="请输入激活码" />
    <button :disabled="loading" @click="handleActivate">
      {{ loading ? '验证中...' : '激活' }}
    </button>
    <p v-if="errorMsg" class="error">{{ errorMsg }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { licenseService } from '@/services/license';

const machineCode = ref('');
const licenseKey = ref('');
const loading = ref(false);
const errorMsg = ref('');

onMounted(async () => {
  try {
    machineCode.value = await licenseService.getMachineCode();
  } catch (e) {
    errorMsg.value = '获取机器码失败: ' + String(e);
  }
});

async function handleActivate() {
  if (!licenseKey.value.trim()) return;
  loading.value = true;
  errorMsg.value = '';
  try {
    const valid = await licenseService.activate(licenseKey.value.trim());
    if (valid) {
      window.location.reload();
    } else {
      errorMsg.value = '激活码无效，请检查后重试';
    }
  } catch (e) {
    errorMsg.value = '验证出错: ' + String(e);
  } finally {
    loading.value = false;
  }
}

function copyCode() {
  navigator.clipboard.writeText(machineCode.value);
}
</script>

<style scoped>
.activation-page { padding: 40px; max-width: 480px; margin: 0 auto; }
.machine-code { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.machine-code code { background: #f5f5f5; padding: 4px 8px; border-radius: 4px; word-break: break-all; }
input { width: 100%; padding: 8px; margin-bottom: 12px; box-sizing: border-box; }
.error { color: red; margin-top: 8px; }
</style>