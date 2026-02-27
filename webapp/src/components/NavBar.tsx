import { NavLink } from "react-router-dom";
import { FileVideoIcon, InfoIcon, MonitorIcon, ShieldCheckIcon } from "./icons";

function navClassName(isActive: boolean): string {
  return isActive ? "top-nav-link active" : "top-nav-link";
}

const NAV_ITEMS = [
  { label: "Console", to: "/console", Icon: MonitorIcon },
  { label: "AAR", to: "/aar", Icon: FileVideoIcon },
  { label: "About", to: "/about", Icon: InfoIcon },
] as const;

export function NavBar(): JSX.Element {
  return (
    <header className="top-nav">
      <div className="brand-wrap">
        <span className="brand-icon" aria-hidden="true">
          <ShieldCheckIcon size={20} />
        </span>
        <div className="brand-title">
          <span className="brand-name">DOZ</span>
          <span className="brand-subtitle">Training Console</span>
        </div>
      </div>

      <nav className="top-nav-tabs" aria-label="Primary">
        {NAV_ITEMS.map(({ label, to, Icon }) => (
          <NavLink key={to} className={({ isActive }) => navClassName(isActive)} to={to}>
            <Icon size={14} className="nav-icon" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
