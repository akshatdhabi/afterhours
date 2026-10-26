import { createApp } from "./app.js";
const instance = await createApp({ dev: process.argv.includes("--dev") });
const port = Number(process.env.PORT || 3000),
  host = process.env.HOST || "0.0.0.0";
instance.http.listen(port, host, () =>
  console.log(`Afterhours is live at http://localhost:${port}`),
);
let closing = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    if (closing) return;
    closing = true;
    await instance.close();
    process.exit(0);
  });
