'use client';

import React, { useEffect, useRef, useState } from 'react';

interface MermaidBlockProps {
  chart: string;
}

declare global {
  interface Window {
    mermaid?: {
      initialize: (config: Record<string, unknown>) => void;
      render: (id: string, text: string) => Promise<{ svg: string }>;
    };
  }
}

function loadMermaidFromCDN(): Promise<NonNullable<Window['mermaid']>> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window not available'));
  if (window.mermaid) return Promise.resolve(window.mermaid);

  return new Promise((resolve, reject) => {
    const existing = document.getElementById('mermaid-cdn-script');
    if (existing) {
      if (window.mermaid) {
        resolve(window.mermaid);
      } else {
        existing.addEventListener('load', () => {
          if (window.mermaid) resolve(window.mermaid);
          else reject(new Error('Mermaid failed to load'));
        });
      }
      return;
    }

    const script = document.createElement('script');
    script.id = 'mermaid-cdn-script';
    script.src = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';
    script.async = true;
    script.onload = () => {
      if (window.mermaid) {
        window.mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          themeVariables: {
            darkMode: true,
            background: '#0d1117',
            primaryColor: '#2563eb',
            primaryTextColor: '#f3f4f6',
            primaryBorderColor: '#3b82f6',
            lineColor: '#60a5fa',
            secondaryColor: '#1e293b',
            tertiaryColor: '#0f172a',
          },
          securityLevel: 'loose',
        });
        resolve(window.mermaid);
      } else {
        reject(new Error('Mermaid not found on window'));
      }
    };
    script.onerror = (e) => reject(new Error(`Failed to load Mermaid from CDN: ${e}`));
    document.head.appendChild(script);
  });
}

export function MermaidBlock({ chart }: MermaidBlockProps) {
  const [svgContent, setSvgContent] = useState<string>('');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function renderDiagram() {
      if (!chart.trim()) return;

      try {
        setLoading(true);
        setRenderError(null);

        // Clean chart string: strip leading 'mermaid' keyword if present
        let cleanChart = chart.trim();
        if (cleanChart.startsWith('mermaid\n') || cleanChart.startsWith('mermaid\r\n')) {
          cleanChart = cleanChart.replace(/^mermaid\r?\n/, '').trim();
        } else if (cleanChart.startsWith('mermaid ')) {
          cleanChart = cleanChart.replace(/^mermaid /, '').trim();
        }

        const mermaid = await loadMermaidFromCDN();
        const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
        const { svg } = await mermaid.render(id, cleanChart);

        if (isMounted) {
          setSvgContent(svg);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : String(err);
          setRenderError(msg);
          setLoading(false);
        }
      }
    }

    renderDiagram();

    return () => {
      isMounted = false;
    };
  }, [chart]);

  if (renderError) {
    return (
      <div className="my-3 rounded-lg border border-red-500/30 bg-red-950/20 p-3 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-red-400 mb-2">
          <span>⚠️ Diagram Rendering Error</span>
        </div>
        <pre className="font-mono text-[11px] text-neutral-300 overflow-x-auto p-2 bg-black/40 rounded">
          {chart}
        </pre>
        <span className="text-[10px] text-red-400/80 block mt-1">{renderError}</span>
      </div>
    );
  }

  if (loading && !svgContent) {
    return (
      <div className="my-3 flex items-center justify-center rounded-lg border border-white/[0.08] bg-neutral-900/40 p-6 text-xs text-neutral-400">
        <div className="flex items-center gap-2">
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
          <span>Rendering Diagram...</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="my-4 flex justify-center overflow-x-auto rounded-lg border border-white/[0.08] bg-neutral-900/60 p-4 shadow-inner w-full [&>svg]:max-w-full [&>svg]:h-auto [&>svg]:drop-shadow-md"
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
}
