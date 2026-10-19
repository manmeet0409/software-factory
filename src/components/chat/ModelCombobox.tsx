'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, Search, Sparkles, Cpu } from 'lucide-react';

interface ModelComboboxProps {
  value: string;
  onChange: (model: string) => void;
  options?: string[];
  disabled?: boolean;
  className?: string;
  compact?: boolean;
  align?: 'left' | 'right';
}

export function ModelCombobox({
  value,
  onChange,
  options = [],
  disabled = false,
  className = '',
  compact = false,
  align = 'left',
}: ModelComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
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

  // Focus search input on open
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filteredOptions = options.filter((opt) =>
    opt.toLowerCase().includes(search.toLowerCase().trim())
  );

  const formatModelLabel = (modelStr: string) => {
    if (!modelStr) return 'Select Model...';
    // Strip variant if attached via '#'
    const cleanModel = modelStr.split('#')[0];
    // e.g. "opencode/nemotron-3.5-super-vl-free" -> "nemotron-3.5-super-vl-free"
    const parts = cleanModel.split('/');
    return parts.length > 1 ? parts[1] : cleanModel;
  };

  const isFree = (modelStr: string) => modelStr.toLowerCase().includes('free');

  return (
    <div ref={containerRef} className={`relative text-left ${className.includes('w-full') ? 'w-full' : 'inline-block'} ${className}`}>
      {/* Combobox Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center gap-1.5 rounded-xl border border-neutral-800 bg-neutral-900/90 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-800 hover:text-white transition-all shadow-sm focus:outline-none focus:border-blue-500/50 max-w-full ${
          compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-2 text-xs'
        } ${className.includes('w-full') ? 'w-full justify-between' : ''} ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title={`Active Model: ${value}`}
      >
        <div className="flex items-center gap-2 truncate min-w-0">
          <Sparkles className="h-3 w-3 text-amber-400 shrink-0" />
          <span className="font-mono truncate">
            {formatModelLabel(value)}
          </span>
          {isFree(value) && (
            <span className="rounded bg-emerald-500/10 px-1 py-0.2 text-[9px] font-mono text-emerald-400 border border-emerald-500/20 shrink-0">
              free
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-3 w-3 text-neutral-400 transition-transform duration-200 shrink-0 ml-1.5 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div
          className={`absolute z-[100] mt-1.5 w-72 sm:w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-neutral-800 bg-neutral-900 p-2.5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100 ${
            align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left'
          }`}
        >
          {/* Search Field */}
          <div className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 mb-1.5">
            <Search className="h-3.5 w-3.5 text-neutral-500 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search or type custom model..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && search.trim()) {
                  onChange(search.trim());
                  setIsOpen(false);
                }
              }}
              className="w-full bg-transparent font-mono text-[11px] text-neutral-200 placeholder-neutral-600 focus:outline-none"
            />
          </div>

          {/* Options List */}
          <div className="max-h-56 overflow-y-auto space-y-0.5 pr-0.5 custom-scrollbar">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => {
                const isSelected = opt === value;
                const free = isFree(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      onChange(opt);
                      setIsOpen(false);
                    }}
                    className={`flex items-center justify-between w-full rounded-xl px-2.5 py-1.5 text-left text-xs transition-colors ${
                      isSelected
                        ? 'bg-blue-600/20 text-blue-300 font-medium'
                        : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Cpu className="h-3 w-3 text-neutral-500 shrink-0" />
                      <div className="flex flex-col truncate">
                        <span className="font-mono text-[11px] truncate">
                          {formatModelLabel(opt)}
                        </span>
                        <span className="text-[9px] text-neutral-500 truncate">
                          {opt}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {free && (
                        <span className="rounded bg-emerald-500/10 px-1 py-0.5 text-[8px] font-mono text-emerald-400 border border-emerald-500/20">
                          free
                        </span>
                      )}
                      {isSelected && <Check className="h-3.5 w-3.5 text-blue-400" />}
                    </div>
                  </button>
                );
              })
            ) : search.trim() ? (
              <button
                type="button"
                onClick={() => {
                  onChange(search.trim());
                  setIsOpen(false);
                }}
                className="flex items-center justify-between w-full rounded-xl px-2.5 py-2 text-left text-xs text-blue-400 hover:bg-neutral-800 transition-colors"
              >
                <span className="font-mono text-[11px]">Use &quot;{search.trim()}&quot;</span>
                <span className="text-[10px] text-neutral-500">Custom</span>
              </button>
            ) : (
              <div className="p-3 text-center text-xs text-neutral-500">
                No models available
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
