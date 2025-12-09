import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
// @ts-ignore
import App from "./App.jsx";
// @ts-ignore
import App2 from "./App2.jsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
