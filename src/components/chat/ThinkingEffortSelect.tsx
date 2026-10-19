'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Brain, ChevronDown, Check } from 'lucide-react';

export interface ThinkingEffortSelectProps {
  value?: string;
  variants?: string[];
  onChange: (variant: string) => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
  align?: 'left' | 'right';
}

export function ThinkingEffortSelect({
  value = '',
  variants = [],
  onChange,
  disabled = false,
  compact = false,
  className = '',
  align = 'left',
}: ThinkingEffortSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const hasVariants = Array.isArray(variants) && variants.length > 0;

  // Formatting variant label nicely
  const formatLabel = (variant: string) => {
    if (!variant || variant === 'default') return 'Default';
    switch (variant.toLowerCase()) {
      case 'none':
        return 'None (Off)';
      case 'minimal':
        return 'Minimal';
      case 'low':
        return 'Low Effort';
      case 'medium':
        return 'Medium Effort';
      case 'high':
        return 'High Effort';
      case 'xhigh':
        return 'X-High';
      case 'max':
        return 'Max Effort';
      default:
        return variant.charAt(0).toUpperCase() + variant.slice(1);
    }
  };

  const getVariantColor = (v: string) => {
    switch (v.toLowerCase()) {
      case 'none':
        return 'text-neutral-400';
      case 'minimal':
      case 'low':
        return 'text-sky-400';
      case 'medium':
        return 'text-emerald-400';
      case 'high':
      case 'xhigh':
      case 'max':
        return 'text-purple-400';
      default:
        return 'text-neutral-300';
    }
  };

  // If this model has no variants, display subtle standard badge
  if (!hasVariants) {
    return (
      <div
        className={`flex items-center gap-1.5 rounded-xl border border-neutral-800/60 bg-neutral-900/40 text-neutral-500 font-mono text-[11px] select-none ${
          compact ? 'px-2 py-1' : 'px-2.5 py-1.5'
        } ${className}`}
        title="This model uses fixed standard reasoning (no effort variants). Select a reasoning model like muse-spark or deepseek to adjust thinking effort."
      >
        <Brain className="h-3 w-3 text-neutral-600 shrink-0" />
        <span className="truncate">Standard</span>
      </div>
    );
  }

  const activeLabel = formatLabel(value);
  const activeColor = getVariantColor(value);

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center gap-1.5 rounded-xl border border-neutral-800 bg-neutral-900/90 text-neutral-200 hover:border-neutral-700 hover:bg-neutral-800/90 hover:text-white transition-all shadow-sm focus:outline-none focus:border-purple-500/50 ${
          compact ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title={`Thinking Effort: ${activeLabel}`}
      >
        <Brain className={`h-3 w-3 shrink-0 ${value ? activeColor : 'text-purple-400'}`} />
        <span className={`font-medium truncate max-w-[90px] sm:max-w-[110px] ${activeColor}`}>
          {activeLabel}
        </span>
        <ChevronDown
          className={`h-3 w-3 text-neutral-400 transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute z-50 mt-1.5 w-44 rounded-2xl border border-neutral-800 bg-neutral-900 p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100 ${
            align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left'
          }`}
        >
          <div className="px-2 py-1 mb-1 border-b border-neutral-800/60 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
            Thinking Effort
          </div>

          <div className="space-y-0.5">
            {/* Default Option */}
            <button
              type="button"
              onClick={() => {
                onChange('');
                setIsOpen(false);
              }}
              className={`flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-xs transition-colors ${
                !value || value === 'default'
                  ? 'bg-purple-600/15 text-purple-300 font-medium'
                  : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <Brain className="h-3 w-3 text-neutral-400" />
                <span>Default</span>
              </div>
              {(!value || value === 'default') && <Check className="h-3.5 w-3.5 text-purple-400" />}
            </button>

            {/* Model-specific variants */}
            {variants.map((v) => {
              const isSelected = value?.toLowerCase() === v.toLowerCase();
              const vColor = getVariantColor(v);

              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    onChange(v);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-xs transition-colors ${
                    isSelected
                      ? 'bg-purple-600/15 text-purple-300 font-medium'
                      : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${vColor.replace('text-', 'bg-')}`} />
                    <span className="capitalize">{v}</span>
                  </div>
                  {isSelected && <Check className="h-3.5 w-3.5 text-purple-400" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
