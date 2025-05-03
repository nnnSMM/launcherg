<script lang="ts">
  import Router from "svelte-spa-router";
  import Layout from "@/layouts/Layout.svelte";
  import { routes } from "@/router/route";
  import { initialize, routeLoaded } from "@/store/tabs";
  import { registerCollectionElementDetails } from "@/lib/registerCollectionElementDetails";
  import { onMount } from "svelte";
  import { initializeAllGameCache } from "@/lib/scrapeAllGame";
  import ImportDropFiles from "@/components/Home/ImportDropFiles.svelte";
  
  import { getCurrentWindow } from "@tauri-apps/api/window";

  $: setDetailPromise = registerCollectionElementDetails();

  onMount(async () => {
    // フロントエンド用の各種初期化
    initialize();
    initializeAllGameCache();

    // データ読み込み完了を待機
    await registerCollectionElementDetails();

    // ウィンドウを取得して表示
    const appWindow = getCurrentWindow();
    await appWindow.show();
  });
</script>

<main class="h-full w-full bg-(bg-primary) font-sans">
  {#await setDetailPromise then _}
    <Layout>
      <Router {routes} on:routeLoaded={routeLoaded} />
    </Layout>
  {/await}
  <ImportDropFiles />
</main>
