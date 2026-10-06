import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import SourcebookWorkspace from "./SourcebookWorkspace";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><SourcebookWorkspace /></StrictMode>,
);
