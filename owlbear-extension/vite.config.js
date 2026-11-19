export default {
  base: process.env.PAGES_BASE_PATH || "/",
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        background: "background.html",
        sheet: "sheet.html",
        presentation: "presentation.html",
      },
    },
  },
};
