import { Navigate, Route, Routes } from "react-router-dom";
import { NavBar } from "./components/NavBar";
import { StatusBar } from "./components/StatusBar";
import { useConsoleData } from "./hooks/useConsoleData";
import { AboutPage } from "./pages/AboutPage";
import { AarPage } from "./pages/AarPage";
import { ConsolePage } from "./pages/ConsolePage";

export default function App(): JSX.Element {
  const model = useConsoleData();

  return (
    <div className="app-root">
      <div className="app-shell">
        <NavBar />
        <StatusBar model={model} />
        {model.degradedWarning != null && <div className="degraded-banner">Degraded: {model.degradedWarning}</div>}

        <main className="app-main">
          <Routes>
            <Route path="/" element={<Navigate to="/console" replace />} />
            <Route path="/console" element={<ConsolePage model={model} />} />
            <Route path="/aar" element={<AarPage />} />
            <Route path="/about" element={<AboutPage model={model} />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
