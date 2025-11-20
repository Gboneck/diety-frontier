import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import { GameRoot } from "./components/GameRoot"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GameRoot />
  </StrictMode>,
)
