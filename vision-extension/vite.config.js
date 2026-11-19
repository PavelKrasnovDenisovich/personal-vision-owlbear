export default {
  base: process.env.PAGES_BASE_PATH || "/",
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        background: "background.html",
        viewer: "viewer.html",
        previewExit: "preview-exit.html",
      },
    },
  },
};
