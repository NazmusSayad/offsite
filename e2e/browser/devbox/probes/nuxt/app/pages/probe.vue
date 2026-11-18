<script setup lang="ts">
const count = ref(0)
const where = ref('')
const api = ref('')
const cookie = ref('')

onMounted(() => {
  where.value = location.href
})

async function callApi() {
  const response = await fetch('/api/probe')
  const data = await response.json()
  api.value = data.message
  cookie.value = document.cookie.includes('probe=yes') ? 'yes' : 'no'
}
</script>

<template>
  <main>
    <h1 id="probe-title">Probe original</h1>
    <p id="location">{{ where }}</p>
    <button id="count" @click="count += 1">count {{ count }}</button>
    <button id="api" @click="callApi">api</button>
    <p id="api-result">{{ api }}</p>
    <p id="cookie">{{ cookie }}</p>
    <NuxtLink id="other" to="/">other</NuxtLink>
  </main>
</template>
