import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Monitor, FileVideo, Info, Shield } from "lucide-react";

const navItems = [
  { name: "Console", page: "Console", icon: Monitor },
  { name: "AAR", page: "AAR", icon: FileVideo },
  { name: "About", page: "About", icon: Info },
];

export default function Layout({ children, currentPageName }) {
  return (
    <div className="min-h-screen bg-[#0a0e17] text-slate-200 flex flex-col">
      <nav className="h-10 bg-[#0d1321] border-b border-slate-800 flex items-center px-4 gap-1 shrink-0">
        <div className="flex items-center gap-2 mr-6">
          <Shield className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold tracking-wide text-cyan-400">DOZ</span>
          <span className="text-xs text-slate-500 hidden sm:inline">Training Console</span>
        </div>
        {navItems.map((item) => {
          const active = currentPageName === item.page;
          return (
            <Link
              key={item.page}
              to={createPageUrl(item.page)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
                active
                  ? "bg-cyan-500/10 text-cyan-400"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <item.icon className="w-3.5 h-3.5" />
              {item.name}
            </Link>
          );
        })}
      </nav>
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}