'use client';

import React, { useState } from 'react';
import { FlaskConical, RefreshCw, Check, AlertCircle } from 'lucide-react';

interface ModelTestButtonProps {
  model: string;
  variant?: string;
  compact?: boolean;
  className?: string;
}

interface TestResult {
  success: boolean;
  latencyMs: number;
  reply?: string;
  error?: string;
}

export function ModelTestButton({
  model,
  variant,
  compact = false,
  className = '',
}: ModelTestButtonProps) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const handleTest = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (testing || !model) return;

    setTesting(true);
    setResult(null);

    try {
      const res = await fetch('/api/models/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, variant }),
      });

      const data = await res.json();
      setResult({
        success: data.success,
        latencyMs: data.latencyMs || 0,
        reply: data.reply,
        error: data.error,
      });

      // Clear result after 7 seconds
      setTimeout(() => {
        setResult(null);
      }, 7000);
    } catch (err: unknown) {
      setResult({
        success: false,
        latencyMs: 0,
        error: err instanceof Error ? err.message : String(err),
      });
      setTimeout(() => {
        setResult(null);
      }, 7000);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className={`relative inline-flex items-center gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={handleTest}
        disabled={testing || !model}
        className={`flex items-center gap-1 rounded-xl border border-neutral-800 bg-neutral-900/90 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-800 hover:text-white active:scale-95 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed ${
          compact ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs'
        }`}
        title={`Send a test ping to model ${model}`}
        aria-label="Test selected model"
      >
        {testing ? (
          <>
            <RefreshCw className="h-3 w-3 animate-spin text-amber-400" />
            <span className="text-[10px] text-amber-300">Testing...</span>
          </>
        ) : (
          <>
            <FlaskConical className="h-3 w-3 text-blue-400" />
            <span className="text-[10px] font-medium">Test</span>
          </>
        )}
      </button>

      {/* Test Result Indicator */}
      {result && (
        <div
          className={`flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-mono border animate-in fade-in zoom-in-95 duration-150 ${
            result.success
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-red-500/10 text-red-400 border-red-500/20'
          }`}
          title={
            result.success
              ? `Success in ${result.latencyMs}ms: "${result.reply || 'OK'}"`
              : `Failed: ${result.error || 'Connection error'}`
          }
        >
          {result.success ? (
            <>
              <Check className="h-2.5 w-2.5 shrink-0" />
              <span>{(result.latencyMs / 1000).toFixed(1)}s</span>
            </>
          ) : (
            <>
              <AlertCircle className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate max-w-[80px]">Error</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
