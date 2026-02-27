import { useLocation } from "react-router-dom";

export default function PageNotFound() {
  const location = useLocation();
  const pageName = location.pathname.substring(1) || "unknown";

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#0a0e17]">
      <div className="max-w-md w-full border border-slate-800 bg-[#111827] rounded-lg p-6 text-center space-y-5">
        <div className="space-y-2">
          <h1 className="text-6xl font-light text-slate-500">404</h1>
          <div className="h-px w-16 bg-slate-700 mx-auto" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-medium text-slate-200">Page Not Found</h2>
          <p className="text-slate-400">
            The page <span className="font-mono text-slate-300">"{pageName}"</span> does not exist.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            window.location.href = "/";
          }}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors"
        >
          Go Home
        </button>
      </div>
    </div>
  );
}
