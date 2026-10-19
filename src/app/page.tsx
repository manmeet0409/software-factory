'use client';

import React, { useState } from 'react';
import { KanbanBoard } from '@/components/board/KanbanBoard';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { WallBoard } from '@/components/wall/WallBoard';
import { SessionHistory } from '@/components/history/SessionHistory';
import { DocSpace } from '@/components/docs/DocSpace';
import { DirectorySelector } from '@/components/workspace/DirectorySelector';
import { AgentSettingsModal } from '@/components/settings/AgentSettingsModal';
import {
  Bot,
  Cpu,
  LayoutGrid,
  BookOpen,
  FileText,
  History,
  MessageSquare,
} from 'lucide-react';

export type FactoryView = 'board' | 'wall' | 'docs' | 'history';

export default function Home() {
  const [activeView, setActiveView] = useState<FactoryView>('board');
  const [mobileTab, setMobileTab] = useState<'chat' | 'view'>('view');

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100 font-sans overflow-hidden">
      {/* Top Navigation / Status Header */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.08] px-4 bg-neutral-950/95 backdrop-blur-md gap-4">
        {/* Logo and Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-600/20 text-blue-400 border border-blue-500/30">
            <Cpu className="h-3.5 w-3.5" />
          </div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-xs font-semibold tracking-tight text-neutral-100">
              Software Factory
            </h1>
            <span className="font-mono text-[10px] text-neutral-500">
              v1.0
            </span>
          </div>
        </div>

        {/* View Tabs Switcher (Sleek Segmented Control) */}
        <nav aria-label="Factory Views" className="flex items-center rounded-lg bg-neutral-900/80 p-0.5 border border-white/[0.06] text-xs">
          <button
            onClick={() => {
              setActiveView('board');
              setMobileTab('view');
            }}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              activeView === 'board'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
            aria-selected={activeView === 'board'}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Workflow Board</span>
            <span className="sm:hidden">Board</span>
          </button>

          <button
            onClick={() => {
              setActiveView('wall');
              setMobileTab('view');
            }}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              activeView === 'wall'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
            aria-selected={activeView === 'wall'}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">The Wall</span>
            <span className="sm:hidden">Wall</span>
          </button>

          <button
            onClick={() => {
              setActiveView('docs');
              setMobileTab('view');
            }}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              activeView === 'docs'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
            aria-selected={activeView === 'docs'}
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Docs</span>
            <span className="sm:hidden">Docs</span>
          </button>

          <button
            onClick={() => {
              setActiveView('history');
              setMobileTab('view');
            }}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              activeView === 'history'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
            aria-selected={activeView === 'history'}
          >
            <History className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sessions</span>
            <span className="sm:hidden">History</span>
          </button>
        </nav>

        {/* Right Nav Utilities */}
        <div className="flex items-center gap-2 text-xs">
          {/* Mobile Chat / View Toggle */}
          <button
            onClick={() => setMobileTab(mobileTab === 'chat' ? 'view' : 'chat')}
            className="lg:hidden flex items-center gap-1 rounded-md border border-white/[0.08] bg-neutral-900 px-2 py-1 text-xs text-neutral-300"
            aria-label="Toggle between Chat and View"
          >
            <MessageSquare className="h-3.5 w-3.5 text-blue-400" />
            <span>{mobileTab === 'chat' ? 'View' : 'Chat'}</span>
          </button>

          <DirectorySelector />
          <AgentSettingsModal />

          <div className="hidden xl:flex items-center gap-2 rounded-md border border-white/[0.08] bg-neutral-900/60 px-2.5 py-1 text-[11px]">
            <span className="text-neutral-400">OpenCode:</span>
            <span className="flex items-center gap-1.5 font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
              Active
            </span>
          </div>
        </div>
      </header>

      {/* Main Factory View: Chat on LEFT side, Main Active View on RIGHT side */}
      <main className="flex flex-1 overflow-hidden p-3 sm:p-4 gap-3 sm:gap-4">
        {/* Left Side: Orchestrator Chat Panel (Desktop: Fixed/Flex Width, Mobile: Tab conditional) */}
        <section
          className={`w-full lg:w-[380px] xl:w-[430px] shrink-0 flex flex-col h-full overflow-hidden ${
            mobileTab === 'chat' ? 'flex' : 'hidden lg:flex'
          }`}
          aria-label="Orchestrator Control Chat"
        >
          <ChatPanel />
        </section>

        {/* Right Side: Selected Factory View (Board | The Wall | Docs | Sessions) */}
        <section
          className={`flex-1 min-w-0 flex flex-col h-full overflow-hidden ${
            mobileTab === 'view' ? 'flex' : 'hidden lg:flex'
          }`}
          aria-label="Factory Workspace"
        >
          {activeView === 'board' && <KanbanBoard />}
          {activeView === 'wall' && <WallBoard />}
          {activeView === 'docs' && <DocSpace />}
          {activeView === 'history' && <SessionHistory />}
        </section>
      </main>
    </div>
  );
}
