import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "./Icon";

interface Props {
  backTo?: string;
  title?: string;
  subtitle?: string;
  right?: ReactNode;
}

export function AppHeader({ backTo, title, subtitle, right }: Props) {
  const navigate = useNavigate();
  return (
    <header className="app-header">
      {backTo ? (
        <button className="icon-btn ghost" onClick={() => navigate(backTo)} aria-label="Back">
          <Icon name="chevron-left" size={26} />
        </button>
      ) : (
        <img className="logo" src="/logo.png" alt="" />
      )}
      <div className="header-text">
        <h1>{title ?? "Boat Storage Manager"}</h1>
        <p>{subtitle ?? "Where the float is my stuff!"}</p>
      </div>
      <div className="header-actions">{right}</div>
    </header>
  );
}
