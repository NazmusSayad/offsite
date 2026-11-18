<script lang="ts">
  import { onMount } from 'svelte'

  let count = $state(0)
  let where = $state('')
  let api = $state('')
  let cookie = $state('')

  onMount(() => {
    where = location.href
  })

  async function callApi() {
    const response = await fetch('/api/probe')
    const data = await response.json()
    api = data.message
    cookie = document.cookie.includes('probe=yes') ? 'yes' : 'no'
  }
</script>

<main>
  <h1 id="probe-title">Probe original</h1>
  <p id="location">{where}</p>
  <button id="count" onclick={() => (count += 1)}>count {count}</button>
  <button id="api" onclick={callApi}>api</button>
  <p id="api-result">{api}</p>
  <p id="cookie">{cookie}</p>
  <a id="other" href="/">other</a>
</main>
