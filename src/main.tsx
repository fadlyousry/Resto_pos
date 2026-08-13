import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/cairo/400.css";
import "@fontsource/cairo/500.css";
import "@fontsource/cairo/600.css";
import "@fontsource/cairo/700.css";
import App from "./app/App";
import { initializeMachineId } from "./shared/license";
import "./styles.css";

async function bootstrap() {
  await initializeMachineId();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

void bootstrap();
