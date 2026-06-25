import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Lock to light mode — app does not support dark theme
localStorage.setItem("theme", "light");
document.documentElement.classList.remove("dark");

createRoot(document.getElementById("root")!).render(<App />);
