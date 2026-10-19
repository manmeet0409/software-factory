'use client';

import React, { useState, useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  Settings,
  X,
  Check,
  AlertCircle,
  RotateCcw,
  Bot,
  Layers,
  Wrench,
  FlaskConical,
  Eye,
  Workflow,
  Sparkles,
  Brain,
  Copy,
  SlidersHorizontal,
} from 'lucide-react';
import { ModelCombobox } from '@/components/chat/ModelCombobox';
import { ModelTestButton } from '@/components/chat/ModelTestButton';

interface AgentModelConfig {
  orchestrator: string;
  manager: string;
  planner: string;
  builder: string;
  tester: string;
  reviewer: string;
  [key: string]: string;
}

const AGENT_METADATA = [
  {
    role: 'orchestrator',
    title: 'Orchestrator',
    desc: 'Primary SDLC Coordinator & Chat Lead',
    details: 'Directs overall workflow, responds to user requests in chat, coordinates tasks, and ensures alignment across the factory pipeline.',
    icon: Sparkles,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
    activeRing: 'ring-amber-500/40 bg-amber-500/10 border-amber-500/40',
  },
  {
    role: 'manager',
    title: 'Manager',
    desc: 'Task Decomposition & Subagent Lead',
    details: 'Breaks complex tickets into discrete subtasks, orchestrates builder & tester subagents, and monitors execution health.',
    icon: Workflow,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
    activeRing: 'ring-blue-500/40 bg-blue-500/10 border-blue-500/40',
  },
  {
    role: 'planner',
    title: 'Planner',
    desc: 'Architectural Planning & Decomposition',
    details: 'Analyzes project dependencies, designs step-by-step implementation roadmaps, and prepares structural plans.',
    icon: Layers,
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10 border-indigo-500/20',
    activeRing: 'ring-indigo-500/40 bg-indigo-500/10 border-indigo-500/40',
  },
  {
    role: 'builder',
    title: 'Builder',
    desc: 'Code Implementation in src/ and tests/',
    details: 'Executes actual coding tasks, creates features, fixes bugs, and writes clean code within isolated worktrees.',
    icon: Wrench,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
    activeRing: 'ring-emerald-500/40 bg-emerald-500/10 border-emerald-500/40',
  },
  {
    role: 'tester',
    title: 'Tester',
    desc: 'Test Suites, Linting & Build Verification',
    details: 'Runs Vitest, builds, lints, and executes automated verification to confirm solutions meet quality standards.',
    icon: FlaskConical,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10 border-purple-500/20',
    activeRing: 'ring-purple-500/40 bg-purple-500/10 border-purple-500/40',
  },
  {
    role: 'reviewer',
    title: 'Reviewer',
    desc: 'Diff Review, Security & Code Quality',
    details: 'Conducts code reviews, audits diffs, checks security guidelines, and validates architectural integrity before merge.',
    icon: Eye,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10 border-cyan-500/20',
    activeRing: 'ring-cyan-500/40 bg-cyan-500/10 border-cyan-500/40',
  },
];

export function AgentSettingsModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedRole, setSelectedRole] = useState('orchestrator');

  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelVariants, setModelVariants] = useState<Record<string, string[]>>({});
  const [agentModels, setAgentModels] = useState<AgentModelConfig>({
    orchestrator: 'opencode/nemotron-3.5-lightning-free',
    manager: 'opencode/nemotron-3.5-lightning-free',
    planner: 'opencode/nemotron-3.5-lightning-free',
    builder: 'opencode/nemotron-3.5-lightning-free',
    tester: 'opencode/nemotron-3.5-lightning-free',
    reviewer: 'opencode/nemotron-3.5-lightning-free',
  });
  const [agentVariants, setAgentVariants] = useState<Record<string, string>>({
    orchestrator: '',
    manager: '',
    planner: '',
    builder: '',
    tester: '',
    reviewer: '',
  });

  // Global batch preset state
  const [globalModel, setGlobalModel] = useState('');
  const [globalVariant, setGlobalVariant] = useState('');
  const [batchNotice, setBatchNotice] = useState('');

  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const fetchModels = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/models');
      if (res.ok) {
        const data = await res.json();
        if (data.availableModels) setAvailableModels(data.availableModels);
        if (data.modelVariants) setModelVariants(data.modelVariants);
        if (data.agentModels) {
          setAgentModels(data.agentModels);
          if (!globalModel && data.agentModels.orchestrator) {
            setGlobalModel(data.agentModels.orchestrator);
          }
        }
        if (data.agentVariants) {
          setAgentVariants(data.agentVariants);
          if (data.agentVariants.orchestrator) {
            setGlobalVariant(data.agentVariants.orchestrator);
          }
        }
      }
    } catch (err: unknown) {
      console.warn('Failed to load models:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchModels();
      setError('');
      setSuccess('');
      setBatchNotice('');
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleModelChange = (role: string, model: string) => {
    setAgentModels((prev) => ({
      ...prev,
      [role]: model,
    }));

    // Reset variant if not supported by new model
    const allowed = modelVariants[model] || [];
    setAgentVariants((prev) => {
      const curr = prev[role];
      if (curr && !allowed.includes(curr)) {
        return { ...prev, [role]: '' };
      }
      return prev;
    });
  };

  const handleVariantChange = (role: string, variant: string) => {
    setAgentVariants((prev) => ({
      ...prev,
      [role]: variant,
    }));
  };

  // Apply a specific model and effort to ALL agents at once
  const applyModelToAllAgents = (targetModel: string, targetVariant: string) => {
    const updatedModels: AgentModelConfig = {
      orchestrator: targetModel,
      manager: targetModel,
      planner: targetModel,
      builder: targetModel,
      tester: targetModel,
      reviewer: targetModel,
    };

    const allowed = modelVariants[targetModel] || [];
    const validVariant = allowed.includes(targetVariant) ? targetVariant : '';

    const updatedVariants: Record<string, string> = {
      orchestrator: validVariant,
      manager: validVariant,
      planner: validVariant,
      builder: validVariant,
      tester: validVariant,
      reviewer: validVariant,
    };

    setAgentModels(updatedModels);
    setAgentVariants(updatedVariants);

    setBatchNotice(`Applied ${targetModel.split('/')[1] || targetModel}${validVariant ? ` (${validVariant})` : ''} to all 6 agents!`);
    setTimeout(() => setBatchNotice(''), 3000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentModels,
          agentVariants,
          activeOrchestratorModel: agentModels.orchestrator,
          activeOrchestratorVariant: agentVariants.orchestrator,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save agent models');
      }

      // Notify active UI panels (e.g. ChatPanel dropdowns) immediately
      window.dispatchEvent(
        new CustomEvent('factory:model-changed', {
          detail: {
            activeOrchestratorModel: data.activeOrchestratorModel || agentModels.orchestrator,
            activeOrchestratorVariant: data.activeOrchestratorVariant || agentVariants.orchestrator,
            agentModels: data.agentModels,
            agentVariants: data.agentVariants,
          },
        })
      );

      setSuccess('Agent models and thinking effort levels updated successfully!');
      setTimeout(() => {
        setIsOpen(false);
        setSuccess('');
      }, 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    const defaultModel = 'opencode/nemotron-3.5-lightning-free';
    setAgentModels({
      orchestrator: defaultModel,
      manager: defaultModel,
      planner: defaultModel,
      builder: defaultModel,
      tester: defaultModel,
      reviewer: defaultModel,
    });
    setAgentVariants({
      orchestrator: '',
      manager: '',
      planner: '',
      builder: '',
      tester: '',
      reviewer: '',
    });
    setBatchNotice('All agents reset to default Nemotron 3.5 Lightning.');
    setTimeout(() => setBatchNotice(''), 3000);
  };

  const activeAgent = AGENT_METADATA.find((a) => a.role === selectedRole) || AGENT_METADATA[0];
  const activeAgentModel = agentModels[activeAgent.role] || 'opencode/nemotron-3.5-lightning-free';
  const activeAgentVariant = agentVariants[activeAgent.role] || '';
  const activeModelVariants = modelVariants[activeAgentModel] || [];

  return (
    <>
      {/* Settings Gear Button in Navigation Bar */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-neutral-900/60 px-2.5 py-1 text-xs text-neutral-300 hover:border-white/[0.15] hover:bg-neutral-900 hover:text-white transition-colors"
        title="Configure Agent Models & Thinking Effort Settings"
        aria-label="Agent Model Settings"
      >
        <Settings className="h-3.5 w-3.5 text-neutral-400 group-hover:text-neutral-200" />
        <span className="hidden sm:inline text-[11px] font-medium">Settings</span>
      </button>

      {/* Settings Modal */}
      {mounted && isOpen && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="agent-settings-title"
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-4xl rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/20">
                  <SlidersHorizontal className="h-5 w-5" />
                </div>
                <div>
                  <h3 id="agent-settings-title" className="text-base font-semibold text-white">
                    Agent Models & Thinking Effort
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Configure model architecture and reasoning levels per agent or across all agents.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Close settings modal"
                className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Notifications */}
            {error && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-400">
                <Check className="h-4 w-4 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            {batchNotice && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-400 animate-in fade-in duration-100">
                <Check className="h-4 w-4 shrink-0" />
                <span>{batchNotice}</span>
              </div>
            )}

            {/* Quick Batch Apply Bar */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-800/90 bg-neutral-950/80 px-4 py-3 shadow-inner">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-neutral-200">
                    Universal Model Sync:
                  </span>
                  <span className="hidden sm:inline text-xs text-neutral-400 ml-1.5">
                    Apply the same model to all 6 agents with 1 click
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <ModelCombobox
                  value={globalModel || activeAgentModel}
                  options={availableModels}
                  onChange={(m) => {
                    setGlobalModel(m);
                    const vars = modelVariants[m] || [];
                    if (globalVariant && !vars.includes(globalVariant)) {
                      setGlobalVariant('');
                    }
                  }}
                  compact
                />
                <button
                  type="button"
                  onClick={() => applyModelToAllAgents(globalModel || activeAgentModel, globalVariant)}
                  className="flex items-center gap-1.5 rounded-xl bg-purple-600/90 hover:bg-purple-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-all"
                  title="Set all 6 agents to this model"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>Apply to All Agents</span>
                </button>
              </div>
            </div>

            {/* Main Master-Detail Body */}
            <form onSubmit={handleSave} className="mt-4 flex-1 flex flex-col min-h-0">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 flex-1 min-h-0 overflow-hidden">
                {/* Left Column: Agent Selector List */}
                <div className="md:col-span-4 border border-neutral-800 rounded-2xl bg-neutral-950/50 p-2 overflow-y-auto space-y-1.5">
                  <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                    Factory Agents (6)
                  </div>
                  {AGENT_METADATA.map((agent) => {
                    const Icon = agent.icon;
                    const isSelected = selectedRole === agent.role;
                    const m = agentModels[agent.role] || '';
                    const v = agentVariants[agent.role] || '';
                    const mName = m.split('/')[1] || m;

                    return (
                      <button
                        key={agent.role}
                        type="button"
                        onClick={() => setSelectedRole(agent.role)}
                        className={`w-full text-left flex items-center justify-between p-2.5 rounded-xl transition-all border ${
                          isSelected
                            ? `${agent.activeRing} border-transparent text-white shadow-sm`
                            : 'border-transparent text-neutral-400 hover:bg-neutral-900/80 hover:text-neutral-200'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`flex h-7 w-7 items-center justify-center rounded-lg border ${agent.bg} ${agent.color} shrink-0`}>
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="truncate">
                            <div className="text-xs font-medium text-neutral-200 truncate">
                              {agent.title}
                            </div>
                            <div className="text-[10px] text-neutral-500 font-mono truncate">
                              {mName || 'nemotron-3.5'}
                            </div>
                          </div>
                        </div>

                        {v && (
                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-md font-mono bg-purple-500/15 text-purple-300 border border-purple-500/20 capitalize">
                            {v}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Right Column: Detailed Configuration Card */}
                <div className="md:col-span-8 border border-neutral-800 rounded-2xl bg-neutral-950/70 p-5 overflow-y-auto space-y-5">
                  {/* Active Agent Header */}
                  <div className="flex items-start justify-between gap-4 pb-4 border-b border-neutral-800">
                    <div className="flex items-center gap-3.5">
                      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${activeAgent.bg} ${activeAgent.color} shrink-0 shadow-sm`}>
                        <activeAgent.icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                          {activeAgent.title} Agent
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
                            role: {activeAgent.role}
                          </span>
                        </h4>
                        <p className="text-xs text-neutral-400 mt-0.5">
                          {activeAgent.desc}
                        </p>
                      </div>
                    </div>

                    <ModelTestButton
                      model={activeAgentModel}
                      variant={activeAgentVariant}
                    />
                  </div>

                  <p className="text-xs text-neutral-400 leading-relaxed bg-neutral-900/60 p-3 rounded-xl border border-neutral-800/80">
                    {activeAgent.details}
                  </p>

                  {/* Section 1: Model Selection */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-neutral-200 flex items-center gap-2">
                      <span>Model Architecture</span>
                    </label>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <ModelCombobox
                          value={activeAgentModel}
                          options={availableModels}
                          onChange={(model) => handleModelChange(activeAgent.role, model)}
                          disabled={saving || loading}
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Thinking Effort (Segmented Pills — ZERO CLIPPING) */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-neutral-200 flex items-center gap-2">
                      <Brain className="h-3.5 w-3.5 text-purple-400" />
                      <span>Thinking Effort / Reasoning Depth</span>
                    </label>

                    {activeModelVariants.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl border border-neutral-800 bg-neutral-900/80">
                        {/* Default Pill */}
                        <button
                          type="button"
                          onClick={() => handleVariantChange(activeAgent.role, '')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            !activeAgentVariant || activeAgentVariant === 'default'
                              ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30 font-semibold'
                              : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                          }`}
                        >
                          <Brain className="h-3 w-3" />
                          <span>Default</span>
                        </button>

                        {/* Available variant pills */}
                        {activeModelVariants.map((v) => {
                          const isSelected = activeAgentVariant?.toLowerCase() === v.toLowerCase();
                          return (
                            <button
                              key={v}
                              type="button"
                              onClick={() => handleVariantChange(activeAgent.role, v)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
                                isSelected
                                  ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30 font-semibold'
                                  : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                              }`}
                            >
                              <span>{v}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 p-3 rounded-xl border border-neutral-800 bg-neutral-900/40 text-xs text-neutral-500 font-mono">
                        <Brain className="h-4 w-4 text-neutral-600 shrink-0" />
                        <span>This model uses standard fixed reasoning with no configurable variants.</span>
                      </div>
                    )}
                  </div>

                  {/* Section 3: Copy this setup to all other agents */}
                  <div className="pt-2 flex items-center justify-between border-t border-neutral-800/80">
                    <span className="text-[11px] text-neutral-400">
                      Want all agents to share this exact configuration?
                    </span>
                    <button
                      type="button"
                      onClick={() => applyModelToAllAgents(activeAgentModel, activeAgentVariant)}
                      className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 font-medium transition-colors"
                    >
                      <Copy className="h-3 w-3" />
                      <span>Copy to other 5 agents</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Modal Actions Footer */}
              <div className="flex items-center justify-between pt-4 mt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={handleResetDefaults}
                  disabled={saving || loading}
                  className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition-colors disabled:opacity-50"
                  title="Reset all agents to default Nemotron 3.5 Lightning"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset All to Defaults</span>
                </button>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="rounded-xl px-4 py-2 text-xs font-medium text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || loading}
                    className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-md shadow-blue-600/20"
                  >
                    {saving ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
