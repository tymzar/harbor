if (document) {
  const PORT = process.env.PORT || 3000;
  const ESBUILD_EVENT_SOURCE =
    process.env.ESBUILD_EVENT_SOURCE || `http://localhost:${PORT}/esbuild`;

  const eventSource = new EventSource(ESBUILD_EVENT_SOURCE);

  eventSource.addEventListener("change", function () {
    console.log("Esbuild change detected - reloading!");
    globalThis.location.reload();
  });
}
