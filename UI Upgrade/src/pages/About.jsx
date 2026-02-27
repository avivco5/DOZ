import React from "react";
import { Shield, AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function About() {
  return (
    <div className="h-[calc(100vh-40px)] overflow-y-auto bg-[#0a0e17] p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-6 h-6 text-cyan-400" />
          <div>
            <h1 className="text-xl font-semibold text-slate-200">DOZ Training Console</h1>
            <p className="text-xs text-slate-500">Directional Warning System — Training Only</p>
          </div>
        </div>

        {/* Version info */}
        <Card className="bg-[#111827] border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-300">Build Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 font-mono-data text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Version</span>
              <span className="text-slate-300">1.0.0-dev</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Build Date</span>
              <span className="text-slate-300">2026-02-26</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Platform</span>
              <span className="text-slate-300">React + Three.js</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Data Mode</span>
              <span className="text-emerald-400">Live Backend (/ws + /api)</span>
            </div>
          </CardContent>
        </Card>

        {/* Safety scope */}
        <Card className="bg-[#111827] border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Safety & Training Scope
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-slate-400">
            <p>
              This system is <strong className="text-emerald-400">strictly for training purposes</strong>. It provides
              directional warning feedback and after-action review (AAR) capabilities for safety exercises.
            </p>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>Real-time monitoring of player positions and status</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>Directional safety alerts and warnings</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>Session recording for after-action review</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>Training arena visualization and player tracking</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Limitations */}
        <Card className="bg-[#111827] border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Limitations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-slate-400">
            <div className="flex items-start gap-2">
              <span className="text-red-400 font-bold">✕</span>
              <span>No targeting, firing, or interception capabilities</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-red-400 font-bold">✕</span>
              <span>No weapon systems integration</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-red-400 font-bold">✕</span>
              <span>No lethal or non-lethal force features</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-red-400 font-bold">✕</span>
              <span>Not intended for operational deployment</span>
            </div>
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 mt-3">
              <div className="flex items-center gap-2 text-amber-400 font-medium mb-1">
                <Info className="w-3.5 h-3.5" />
                Training Use Only
              </div>
              <p className="text-slate-500">
                This product is designed exclusively for safety training feedback and after-action review.
                It does not include any features that could be used to cause harm.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="text-center text-[10px] text-slate-600 py-4">
          DOZ Training Console · For authorized training use only
        </div>
      </div>
    </div>
  );
}
