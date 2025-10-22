import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initFirebase, ensureAuth } from "@/lib/firebase";

// Initialize Firebase and attempt to ensure anonymous auth before mounting the app.
// This helps realtime subscriptions (onValue) attach reliably when DB rules
// require authentication.
(async () => {
  try {
    initFirebase();
    // best-effort ensure auth; don't block render indefinitely
    void (async () => {
      try {
        await ensureAuth();
      } catch (err) {
        // ignore ensureAuth failures here; listeners will still attempt to attach
        // and errors will be surfaced in console when DEBUG=true
        console.debug("ensureAuth on startup failed", err);
      }
    })();
  } catch (err) {
    // ignore init errors — App will still render and firebase helpers will attempt
    // to initialize lazily when used.
    console.debug("firebase init on startup error", err);
  }

  createRoot(document.getElementById("root")!).render(<App />);
})();
