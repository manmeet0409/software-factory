'use client';

import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  Bot,
  User,
  AlertCircle,
  RefreshCw,
  SquarePen,
  Copy,
  Check,
  Sparkles,
  Paperclip,
  Undo2,
  Pin,
  X,
} from 'lucide-react';
import { ModelCombobox } from './ModelCombobox';
import { ModelTestButton } from './ModelTestButton';
import { ThinkingEffortSelect } from './ThinkingEffortSelect';
import { useFileUpload } from '@/lib/hooks/useFileUpload';
import { AttachmentTray } from '@/components/ui/AttachmentTray';

export interface ProactiveAlertInfo {
  ticketId: string;
  title: string;
  message: string;
}

interface Message {
  id: string;
  sender: 'user' | 'orchestrator';
  text: string;
  timestamp: number;
  ticketCreated?: boolean;
  promptMsgId?: string;
  sessionId?: string;
  pairMessageId?: string;
  wallPins?: Array<{ id: string; title: string }>;
}

interface PendingTurn {
  sessionId: string;
  promptMsgId?: string;
  step?: string;
  startedAt: number;
}

function getWelcomeMessage(dir?: string, branch?: string | null): Message {
  return {
    id: 'welcome',
    sender: 'orchestrator',
    text: `### Factory Orchestrator Online

${
  dir
    ? `**Active Workspace:** \`${dir}\`${branch ? ` (branch: \`${branch}\`)` : ''}`
    : '**No workspace selected.** Choose a project folder to begin.'
}

I coordinate the multi-agent development pipeline and manage isolated git worktrees.

**Quick Commands**:
- **Create task**: \`Create task: <description>\`
- **Check pipeline**: \`What is the factory status?\`
- **Review & merge**: \`Approve ticket <id>\`
- **Consult**: Ask architectural questions or request code audits.`,
    timestamp: 0,
  };
}

const DEFAULT_WELCOME_MESSAGE: Message = getWelcomeMessage();

// Code block renderer with language pill and copy-to-clipboard
function CodeBlock({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const codeString = String(children).replace(/\n$/, '');

  const isInline = !match && !codeString.includes('\n');

  if (isInline) {
    return (
      <code
        className="rounded bg-neutral-800/90 border border-neutral-700/60 px-1 py-0.5 font-mono text-[11px] text-blue-300"
        {...props}
      >
        {children}
      </code>
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="relative my-2 rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-900/70 border-b border-neutral-800/80 text-[10px] text-neutral-400 font-mono">
        <span>{language || 'code'}</span>
        <button
          onClick={handleCopy}
          aria-label="Copy code snippet to clipboard"
          className="flex items-center gap-1 text-neutral-400 hover:text-white transition-colors"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-neutral-200">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([DEFAULT_WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [proactiveAlert, setProactiveAlert] = useState<ProactiveAlertInfo | null>(null);
  const [dismissedAlertTicketIds, setDismissedAlertTicketIds] = useState<string[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [pendingTurns, setPendingTurns] = useState<Record<string, PendingTurn>>({});
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [revertingMsgId, setRevertingMsgId] = useState<string | null>(null);
  const [confirmWallPinRevertMsg, setConfirmWallPinRevertMsg] = useState<Message | null>(null);
  const [activeModel, setActiveModel] = useState('opencode/nemotron-3.5-lightning-free');
  const [activeVariant, setActiveVariant] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelVariants, setModelVariants] = useState<Record<string, string[]>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    attachments,
    isUploading,
    removeAttachment,
    clearAttachments,
    handlePaste,
    handleDrop,
    handleFileSelect,
  } = useFileUpload({ scope: 'chat' });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, pendingTurns]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const applyModelUpdate = (rawModel?: string, rawVariant?: string) => {
    if (!rawModel) return;
    let cleanModel = rawModel;
    let variant = rawVariant !== undefined ? rawVariant : '';
    if (cleanModel.includes('#')) {
      const [m, v] = cleanModel.split('#');
      cleanModel = m;
      if (v && !variant) variant = v;
    }
    setActiveModel(cleanModel);
    setActiveVariant(variant);
  };

  // Load models and variants on mount
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch('/api/models');
        if (res.ok) {
          const data = await res.json();
          if (data.availableModels) setAvailableModels(data.availableModels);
          if (data.modelVariants) setModelVariants(data.modelVariants);

          const initialModel = data.activeOrchestratorModel || '';
          const initialVariant = data.activeOrchestratorVariant || '';
          if (initialModel) {
            applyModelUpdate(initialModel, initialVariant);
          }
        }
      } catch (err) {
        console.warn('Failed to load models:', err);
      }
    };
    fetchModels();
  }, []);

  const handleModelChange = async (newModel: string) => {
    let cleanModel = newModel;
    let chosenVariant = activeVariant;
    if (newModel.includes('#')) {
      const [m, v] = newModel.split('#');
      cleanModel = m;
      if (v) chosenVariant = v;
    }

    setActiveModel(cleanModel);
    const allowed = modelVariants[cleanModel] || [];
    const nextVariant = allowed.includes(chosenVariant) ? chosenVariant : '';
    setActiveVariant(nextVariant);

    try {
      const res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activeOrchestratorModel: cleanModel,
          activeOrchestratorVariant: nextVariant,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.sessionId) {
          setActiveSessionId(data.sessionId);
        }
      }
    } catch (err) {
      console.warn('Failed to override model:', err);
    }
  };

  const handleVariantChange = async (newVariant: string) => {
    setActiveVariant(newVariant);
    try {
      const res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activeOrchestratorModel: activeModel,
          activeOrchestratorVariant: newVariant,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.sessionId) {
          setActiveSessionId(data.sessionId);
        }
      }
    } catch (err) {
      console.warn('Failed to override variant:', err);
    }
  };

  // Session-aware chat loader: fetches conversation for activeSessionId or fallback welcome
  const loadChatForSession = async (sessId?: string | null) => {
    try {
      const [wsRes, chatRes] = await Promise.all([
        fetch('/api/workspace'),
        fetch(sessId ? `/api/chat?sessionId=${encodeURIComponent(sessId)}` : '/api/chat'),
      ]);

      let dir: string | undefined;
      let branch: string | null = null;
      if (wsRes.ok) {
        const wsData = await wsRes.json();
        dir = wsData.workspace?.directory;
        branch = wsData.workspace?.branch;
      }

      if (chatRes.ok) {
        const data = await chatRes.json();
        if (data.sessionId && !sessId) {
          setActiveSessionId(data.sessionId);
        }
        if (data.model) {
          applyModelUpdate(data.model, data.variant);
        }
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages);
        } else {
          setMessages([getWelcomeMessage(dir, branch)]);
        }
      }
    } catch (err) {
      console.error('Failed to load chat messages:', err);
    }
  };

  // Initial load: determine active orchestrator session and load its chat
  useEffect(() => {
    const initChat = async () => {
      try {
        const res = await fetch('/api/sessions');
        if (res.ok) {
          const data = await res.json();
          const orch = data.activeSessions?.find((s: { role: string }) => s.role === 'orchestrator');
          if (orch?.id) {
            setActiveSessionId(orch.id);
            if (orch.model) {
              applyModelUpdate(orch.model);
            }
            await loadChatForSession(orch.id);
            return;
          }
        }
      } catch {
        // ignore
      }
      await loadChatForSession(null);
    };

    initChat();
  }, []);

  // Listen for workspace/profile switches, model changes, and session resume events
  useEffect(() => {
    const handleWorkspaceSwitch = (dir?: string, branch?: string | null) => {
      setMessages([getWelcomeMessage(dir, branch)]);
      setPendingTurns({});
      setActiveSessionId(null);

      // Re-fetch active orchestrator session for new profile
      fetch('/api/sessions')
        .then((r) => r.ok && r.json())
        .then((data) => {
          if (data?.activeSessions) {
            const orch = data.activeSessions.find((s: { role: string }) => s.role === 'orchestrator');
            if (orch) {
              setActiveSessionId(orch.id);
              if (orch.model) {
                applyModelUpdate(orch.model);
              }
              loadChatForSession(orch.id);
            }
          }
        })
        .catch(() => {});
    };

    // 1. Local window event from DirectorySelector
    const onWindowChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      handleWorkspaceSwitch(detail?.directory, detail?.branch);
    };
    window.addEventListener('factory:directory-changed', onWindowChange);

    // 2. Local window event when user resumes a session from SessionHistory
    const onSessionResumed = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.sessionId) {
        setActiveSessionId(detail.sessionId);
        if (detail.model) {
          applyModelUpdate(detail.model, detail.variant);
        }
        await loadChatForSession(detail.sessionId);
      }
    };
    window.addEventListener('factory:session-resumed', onSessionResumed);

    // 3. Local window event when all sessions are cleared from SessionHistory or ChatPanel
    const onSessionsCleared = () => {
      setActiveSessionId(null);
      setMessages([getWelcomeMessage()]);
      setPendingTurns({});
    };
    window.addEventListener('factory:sessions-cleared', onSessionsCleared);

    // 4. Local window event when model is updated via Settings modal
    const onModelChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.activeOrchestratorModel) {
        applyModelUpdate(detail.activeOrchestratorModel, detail.activeOrchestratorVariant);
      }
      fetch('/api/models')
        .then((r) => r.ok && r.json())
        .then((data) => {
          if (data?.availableModels) setAvailableModels(data.availableModels);
          if (data?.modelVariants) setModelVariants(data.modelVariants);
        })
        .catch(() => {});
    };
    window.addEventListener('factory:model-changed', onModelChanged);

    // 5. Real-time SSE event
    const eventSource = new EventSource('/api/events');
    eventSource.addEventListener('workspace:changed', (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data);
        handleWorkspaceSwitch(payload.data?.directory, payload.data?.branch);
      } catch {
        // ignore
      }
    });

    eventSource.addEventListener('model:updated', (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data);
        const data = payload.data || payload;
        if (data?.activeOrchestratorModel) {
          applyModelUpdate(data.activeOrchestratorModel, data.activeOrchestratorVariant);
        }
        if (data?.sessionId) {
          setActiveSessionId(data.sessionId);
        }
      } catch {
        // ignore
      }
    });

    eventSource.addEventListener('session:updated', async (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.action === 'clear_all' || payload.action === 'reset') {
          setActiveSessionId(null);
          setMessages([getWelcomeMessage()]);
          setPendingTurns({});
          return;
        }

        const nextId = payload.data?.sessionId || payload.sessionId;
        if (nextId) {
          setActiveSessionId(nextId);
          await loadChatForSession(nextId);
        } else {
          fetch('/api/sessions')
            .then((r) => r.ok && r.json())
            .then((data) => {
              if (data?.activeSessions) {
                const orch = data.activeSessions.find((s: { role: string }) => s.role === 'orchestrator');
                if (orch) {
                  setActiveSessionId(orch.id);
                  if (orch.model) {
                    applyModelUpdate(orch.model);
                  }
                  loadChatForSession(orch.id);
                } else {
                  setActiveSessionId(null);
                }
              }
            })
            .catch(() => {});
        }
      } catch {
        // ignore
      }
    });

    return () => {
      window.removeEventListener('factory:directory-changed', onWindowChange);
      window.removeEventListener('factory:session-resumed', onSessionResumed);
      window.removeEventListener('factory:sessions-cleared', onSessionsCleared);
      window.removeEventListener('factory:model-changed', onModelChanged);
      eventSource.close();
    };
  }, []);

  // Poll for any active pending turns until finished
  useEffect(() => {
    const pendingMsgIds = Object.keys(pendingTurns);
    if (pendingMsgIds.length === 0) return;

    const interval = setInterval(async () => {
      for (const msgId of pendingMsgIds) {
        const turn = pendingTurns[msgId];
        if (!turn) continue;

        try {
          const pollUrl = `/api/chat?checkSession=${encodeURIComponent(turn.sessionId)}&messageId=${encodeURIComponent(msgId)}${
            turn.promptMsgId ? `&promptMsgId=${encodeURIComponent(turn.promptMsgId)}` : ''
          }`;
          const res = await fetch(pollUrl);
          if (res.ok) {
            const data = await res.json();
            if (data.done) {
              setMessages((prev) =>
                prev.map((m) => (m.id === msgId ? { ...m, text: data.reply } : m))
              );
              setPendingTurns((prev) => {
                const next = { ...prev };
                delete next[msgId];
                return next;
              });
            } else if (data.step && data.step !== turn.step) {
              setPendingTurns((prev) => ({
                ...prev,
                [msgId]: { ...prev[msgId], step: data.step },
              }));
            }
          }
        } catch (err) {
          console.warn('Pending turn poll error:', err);
        }
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [pendingTurns]);

  // Periodic proactive prompt check
  useEffect(() => {
    const checkProactive = async () => {
      // In a fresh/new chat (no user messages yet), suppress proactive alerts
      const hasUserMessage = messages.some((m) => m.sender === 'user');
      if (!hasUserMessage) {
        setProactiveAlert(null);
        return;
      }

      try {
        const res = await fetch('/api/tickets');
        if (res.ok) {
          const data = await res.json();
          const ready = data.tickets?.find(
            (t: { id: string; title: string; status: string }) =>
              (t.status === 'agent_tested' || t.status === 'agent_done') &&
              !dismissedAlertTicketIds.includes(t.id)
          );
          if (ready) {
            setProactiveAlert({
              ticketId: ready.id,
              title: ready.title,
              message: `Ticket "${ready.title}" is ready for user testing!`,
            });
          } else {
            setProactiveAlert(null);
          }
        }
      } catch {
        // ignore
      }
    };

    checkProactive();
    const interval = setInterval(checkProactive, 15000);
    return () => clearInterval(interval);
  }, [messages, dismissedAlertTicketIds]);

  const handleNewChat = async () => {
    try {
      const res = await fetch('/api/chat', { method: 'DELETE' });
      if (res.ok) {
        const wsRes = await fetch('/api/workspace');
        const wsData = wsRes.ok ? await wsRes.json() : null;
        setMessages([getWelcomeMessage(wsData?.workspace?.directory, wsData?.workspace?.branch)]);
        setPendingTurns({});
        setActiveSessionId(null);
        clearAttachments();
        setProactiveAlert(null);

        // Dismiss current active alert ticket so it doesn't immediately repopulate
        if (proactiveAlert?.ticketId) {
          setDismissedAlertTicketIds((prev) =>
            prev.includes(proactiveAlert.ticketId) ? prev : [...prev, proactiveAlert.ticketId]
          );
        }

        fetch('/api/models')
          .then((r) => r.ok && r.json())
          .then((data) => {
            if (data?.activeOrchestratorModel) {
              applyModelUpdate(data.activeOrchestratorModel, data.activeOrchestratorVariant);
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      console.error('Failed to start new chat:', err);
    } finally {
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }
  };

  const handleCopyMessage = async (msgId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMsgId(msgId);
      setTimeout(() => setCopiedMsgId(null), 1500);
    } catch (err) {
      console.warn('Failed to copy to clipboard:', err);
    }
  };

  const handleRevertTurn = async (userMsg: Message) => {
    if (loading || revertingMsgId) return;
    setRevertingMsgId(userMsg.id);

    try {
      const pinIds = userMsg.wallPins?.map((p) => p.id) || [];
      const res = await fetch('/api/chat/revert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: userMsg.sessionId || activeSessionId,
          promptMsgId: userMsg.promptMsgId,
          userMessageId: userMsg.id,
          orchestratorMessageId: userMsg.pairMessageId,
          wallPinIds: pinIds,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Remove both user message and paired orchestrator message from state
        setMessages((prev) =>
          prev.filter((m) => m.id !== userMsg.id && m.id !== (userMsg.pairMessageId || data.orchestratorMessageId))
        );

        // Pre-populate input with user's original message
        if (data.revertedText) {
          setInput(data.revertedText);
        } else if (userMsg.text) {
          setInput(userMsg.text);
        }

        // Notify app if orchestrator wall pins were reverted
        if (data.removedWallPins && data.removedWallPins.length > 0) {
          window.dispatchEvent(new CustomEvent('factory:wall-updated'));
        }

        // Focus textarea
        requestAnimationFrame(() => {
          textareaRef.current?.focus();
        });
      }
    } catch (err) {
      console.error('Failed to revert turn:', err);
    } finally {
      setRevertingMsgId(null);
      setConfirmWallPinRevertMsg(null);
    }
  };

  const onRevertButtonClick = (msg: Message) => {
    if (msg.wallPins && msg.wallPins.length > 0) {
      setConfirmWallPinRevertMsg(msg);
    } else {
      handleRevertTurn(msg);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const rawText = textToSend || input;
    if ((!rawText.trim() && attachments.length === 0) || loading) {
      textareaRef.current?.focus();
      return;
    }

    let messageText = rawText.trim();
    if (attachments.length > 0) {
      const attachmentsBlock = attachments
        .map((a) => {
          if (a.mimeType.startsWith('image/')) {
            return `![${a.originalName}](${a.url})\n*(Image file on disk: \`${a.localPath}\`)*`;
          }
          return `📎 [${a.originalName}](${a.url})\n*(File on disk: \`${a.localPath}\`)*`;
        })
        .join('\n\n');

      messageText = messageText ? `${messageText}\n\n${attachmentsBlock}` : attachmentsBlock;
      clearAttachments();
    }

    const tempUserMessage: Message = {
      id: Math.random().toString(),
      sender: 'user',
      text: messageText,
      timestamp: Math.floor(Date.now() / 1000),
    };

    setMessages((prev) => [...prev, tempUserMessage]);
    if (!textToSend) setInput('');
    setLoading(true);

    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText }),
      });

      if (res.ok) {
        const data = await res.json();
        const orchId = data.orchestratorMessage?.id || Math.random().toString();
        const orchestratorMsg: Message = {
          id: orchId,
          sender: 'orchestrator',
          text: data.reply,
          timestamp: data.orchestratorMessage?.timestamp || Math.floor(Date.now() / 1000),
          ticketCreated: data.ticketCreated,
          promptMsgId: data.promptMsgId,
          sessionId: data.sessionId,
          pairMessageId: data.userMessage?.id || tempUserMessage.id,
          wallPins: data.wallPins || [],
        };

        const updatedUserMsg: Message = {
          ...tempUserMessage,
          id: data.userMessage?.id || tempUserMessage.id,
          ticketCreated: data.ticketCreated,
          promptMsgId: data.promptMsgId,
          sessionId: data.sessionId,
          pairMessageId: orchId,
          wallPins: data.wallPins || [],
        };

        setMessages((prev) => [...prev.slice(0, -1), updatedUserMsg, orchestratorMsg]);

        if (data.sessionId) {
          setActiveSessionId(data.sessionId);
        }

        if (data.model) {
          applyModelUpdate(data.model, data.variant);
        }

        // If turn is long-running/async, register for active background polling
        if (data.isPending && data.sessionId) {
          setPendingTurns((prev) => ({
            ...prev,
            [orchestratorMsg.id]: {
              sessionId: data.sessionId,
              promptMsgId: data.promptMsgId,
              step: 'Executing tools and preparing final response...',
              startedAt: Date.now(),
            },
          }));
        }

        if (data.proactiveAlert && !dismissedAlertTicketIds.includes(data.proactiveAlert.ticketId)) {
          setProactiveAlert(data.proactiveAlert);
        } else if (data.proactivePrompt && typeof data.proactivePrompt === 'string' && !data.proactiveAlert) {
          setProactiveAlert({
            ticketId: 'unknown',
            title: 'Ready for Review',
            message: data.proactivePrompt,
          });
        }
      } else {
        const errorData = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            id: Math.random().toString(),
            sender: 'orchestrator',
            text: `⚠️ **Error**: ${errorData.error || 'Failed to process request.'}`,
            timestamp: Math.floor(Date.now() / 1000),
          },
        ]);
      }
    } catch (err: unknown) {
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          sender: 'orchestrator',
          text: `⚠️ **Connection error**: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Math.floor(Date.now() / 1000),
        },
      ]);
    } finally {
      setLoading(false);
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }
  };

  const quickPills = [
    'Is there any file in the dir?',
    'What is on the wall?',
    'What is the factory status?',
    'Show active sessions',
  ];

  return (
    <div className="flex flex-col h-full rounded-lg border border-white/[0.08] bg-neutral-900/40 shadow-sm overflow-hidden">
      {/* Primary Header Row: Orchestrator Status & New Chat Button */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2 bg-neutral-950/60 backdrop-blur-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600/10 text-blue-400 border border-blue-500/20 shrink-0">
            <Bot className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-medium text-neutral-200 flex items-center gap-1.5 truncate">
              Factory Orchestrator
            </h3>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-neutral-500 truncate">
              {activeSessionId ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                  <span className="text-emerald-400 truncate">Slot 1/5 • #{activeSessionId.slice(0, 8)}</span>
                </>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0"></span>
                  <span className="text-neutral-400">Ready</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Button: New Chat */}
        <div className="flex items-center gap-1.5 shrink-0">
          {(() => {
            const hasUserMessage = messages.some((m) => m.sender === 'user');
            const canNewChat = hasUserMessage || Boolean(activeSessionId);
            return (
              <button
                onClick={handleNewChat}
                disabled={!canNewChat}
                aria-label="Start new chat"
                title={canNewChat ? 'Start new conversation (session created on next message)' : 'Already in a new chat'}
                className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-neutral-900/60 px-2 py-1 text-xs font-medium text-neutral-300 hover:border-white/[0.15] hover:bg-neutral-900 hover:text-white transition-colors group disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <SquarePen className="h-3.5 w-3.5 text-neutral-400 group-hover:text-neutral-200 transition-colors" />
                <span className="text-[11px]">New Chat</span>
              </button>
            );
          })()}
        </div>
      </div>

      {/* Secondary Toolbar Row: Model, Thinking Effort, & Test Controls */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-1.5 bg-neutral-950/40 text-xs gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <ModelCombobox
            value={activeModel}
            options={availableModels}
            onChange={handleModelChange}
            compact
            className="max-w-[170px]"
          />

          <ThinkingEffortSelect
            value={activeVariant}
            variants={modelVariants[activeModel] || []}
            onChange={handleVariantChange}
            compact
          />
        </div>

        <ModelTestButton
          model={activeModel}
          variant={activeVariant}
          compact
        />
      </div>

      {/* Proactive Notification Banner */}
      {proactiveAlert && (
        <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-3.5 py-1.5 text-xs text-amber-300 animate-in fade-in">
          <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
          <span className="flex-1 truncate text-[11px] font-medium">{proactiveAlert.message}</span>
          <button
            onClick={() => {
              const tid = proactiveAlert.ticketId;
              if (tid && tid !== 'unknown') {
                setDismissedAlertTicketIds((prev) => (prev.includes(tid) ? prev : [...prev, tid]));
              }
              setProactiveAlert(null);
              handleSendMessage(tid && tid !== 'unknown' ? `approve ${tid}` : 'approve');
            }}
            className="rounded-lg bg-amber-500/20 px-2.5 py-1 text-[10px] font-semibold text-amber-200 hover:bg-amber-500/30 transition-colors border border-amber-500/30 shrink-0"
          >
            Approve
          </button>
          <button
            onClick={() => {
              const tid = proactiveAlert.ticketId;
              if (tid && tid !== 'unknown') {
                setDismissedAlertTicketIds((prev) => (prev.includes(tid) ? prev : [...prev, tid]));
              }
              setProactiveAlert(null);
            }}
            aria-label="Dismiss notification"
            title="Dismiss notification"
            className="rounded-lg p-1 text-amber-400/70 hover:text-amber-200 hover:bg-amber-500/20 transition-colors shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Messages Stream */}
      <div
        role="log"
        aria-live="polite"
        aria-label="Orchestrator chat log"
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {messages.map((msg) => {
          const isPending = !!pendingTurns[msg.id];
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              {/* Sender metadata bar */}
              <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-neutral-400">
                {msg.sender === 'user' ? (
                  <>
                    <span>You</span>
                    <User className="h-2.5 w-2.5 text-blue-400" />
                  </>
                ) : (
                  <>
                    <Bot className="h-2.5 w-2.5 text-emerald-400" />
                    <span>Orchestrator</span>
                  </>
                )}
                {msg.sender !== 'user' && msg.timestamp > 0 && (
                  <span>• {new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                )}
              </div>

              {/* Bubble */}
              <div
                className={`max-w-[90%] rounded-2xl p-3.5 text-xs shadow-sm ${
                  msg.sender === 'user'
                    ? 'bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-br-none shadow-blue-600/10'
                    : 'bg-neutral-950/85 text-neutral-200 border border-neutral-800/90 rounded-bl-none'
                }`}
              >
                {msg.sender === 'orchestrator' ? (
                  <div className="space-y-2 leading-relaxed break-words">
                    {/* Live pending progress indicator */}
                    {isPending && (
                      <div className="mb-2 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 animate-pulse">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-amber-300 text-[11px] flex items-center gap-1.5">
                            <span>Executing in OpenCode</span>
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping"></span>
                          </div>
                          <div className="text-[10px] text-amber-200/80 truncate">
                            {pendingTurns[msg.id]?.step || 'Executing tools and preparing final response...'}
                          </div>
                        </div>
                      </div>
                    )}

                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed text-neutral-200">{children}</p>,
                        h1: ({ children }) => <h1 className="text-sm font-bold text-white mb-2 mt-3 first:mt-0">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-xs font-bold text-neutral-100 mb-1.5 mt-2.5 first:mt-0">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-xs font-semibold text-neutral-200 mb-1 mt-2 first:mt-0">{children}</h3>,
                        ul: ({ children }) => (
                          <ul className="list-disc pl-4 space-y-1 my-2 last:mb-0 text-neutral-300">
                            {children}
                          </ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="list-decimal pl-4 space-y-1 my-2 last:mb-0 text-neutral-300">
                            {children}
                          </ol>
                        ),
                        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                        strong: ({ children }) => (
                          <strong className="font-semibold text-white">{children}</strong>
                        ),
                        em: ({ children }) => (
                          <em className="text-neutral-300 italic">{children}</em>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-2 border-blue-500/80 bg-blue-500/5 px-3 py-1.5 my-2 rounded-r text-neutral-300 text-[11px] italic">
                            {children}
                          </blockquote>
                        ),
                        table: ({ children }) => (
                          <div className="overflow-x-auto my-2 rounded-lg border border-neutral-800">
                            <table className="min-w-full text-[11px] divide-y divide-neutral-800">
                              {children}
                            </table>
                          </div>
                        ),
                        th: ({ children }) => (
                          <th className="px-2.5 py-1.5 bg-neutral-900 font-semibold text-left text-neutral-200">
                            {children}
                          </th>
                        ),
                        td: ({ children }) => (
                          <td className="px-2.5 py-1.5 border-t border-neutral-800 text-neutral-300">
                            {children}
                          </td>
                        ),
                        a: ({ href, children }) => (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 underline font-medium"
                          >
                            {children}
                          </a>
                        ),
                        hr: () => <hr className="my-2.5 border-neutral-800" />,
                        code: CodeBlock,
                        img: ({ src, alt }) => {
                          const srcStr = typeof src === 'string' ? src : undefined;
                          return (
                            <img
                              src={srcStr}
                              alt={alt || ''}
                              className="max-h-60 max-w-full rounded-lg border border-neutral-700/80 my-2 object-contain cursor-pointer hover:opacity-95 transition-opacity"
                              onClick={() => srcStr && window.open(srcStr, '_blank')}
                            />
                          );
                        },
                      }}
                    >
                      {msg.text}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <div className="leading-relaxed break-words">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => <p className="leading-relaxed mb-1 last:mb-0">{children}</p>,
                          a: ({ href, children }) => (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline text-blue-100 hover:text-white font-medium"
                            >
                              {children}
                            </a>
                          ),
                          img: ({ src, alt }) => {
                            const srcStr = typeof src === 'string' ? src : undefined;
                            return (
                              <img
                                src={srcStr}
                                alt={alt || ''}
                                className="max-h-60 max-w-full rounded-lg border border-blue-400/40 my-2 object-contain cursor-pointer hover:opacity-95 transition-opacity"
                                onClick={() => srcStr && window.open(srcStr, '_blank')}
                              />
                            );
                          },
                          code: ({ children }) => (
                            <code className="rounded bg-blue-700/60 px-1 py-0.5 font-mono text-[11px] text-blue-100">
                              {children}
                            </code>
                          ),
                        }}
                      >
                        {msg.text}
                      </ReactMarkdown>
                    </div>

                    {/* User message action bar: timestamp, copy, and conditional revert (undo) */}
                    <div className="flex items-center justify-end gap-1.5 pt-0.5 text-[10px] text-blue-200/80 select-none">
                      {msg.timestamp > 0 && (
                        <span className="font-mono text-[10px] text-blue-200/80 mr-0.5">
                          {new Date(msg.timestamp * 1000).toLocaleTimeString([], {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg.id, msg.text)}
                        className="p-1 rounded hover:bg-white/10 hover:text-white text-blue-200 transition-colors"
                        title="Copy message"
                        aria-label="Copy user message"
                      >
                        {copiedMsgId === msg.id ? (
                          <Check className="h-3.5 w-3.5 text-emerald-300" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                      {!msg.ticketCreated && (
                        <button
                          type="button"
                          onClick={() => onRevertButtonClick(msg)}
                          disabled={loading || revertingMsgId === msg.id}
                          className="p-1 rounded hover:bg-white/10 hover:text-white text-blue-200 transition-colors disabled:opacity-50"
                          title={msg.wallPins?.length ? `Revert turn and remove ${msg.wallPins.length} Wall pin(s)` : "Revert turn (undo prompt & restore files)"}
                          aria-label="Revert this turn"
                        >
                          {revertingMsgId === msg.id ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-300" />
                          ) : (
                            <Undo2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-neutral-400 py-1 pl-1">
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-400" />
            <span>Orchestrator thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Action Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-1.5 border-t border-white/[0.06] bg-neutral-950/40">
        {quickPills.map((pill) => (
          <button
            key={pill}
            onClick={() => {
              handleSendMessage(pill);
              textareaRef.current?.focus();
            }}
            className="whitespace-nowrap rounded-md border border-white/[0.08] bg-neutral-900/60 px-2 py-0.5 text-[11px] text-neutral-400 hover:border-white/[0.15] hover:text-neutral-200 transition-colors"
          >
            {pill}
          </button>
        ))}
      </div>

      {/* Input Form with Attachment Tray, File Drop, Paste, and Auto-Resize */}
      <div
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="border-t border-white/[0.08] bg-neutral-950/80 p-2.5 transition-colors"
      >
        <AttachmentTray
          attachments={attachments}
          onRemove={removeAttachment}
          isUploading={isUploading}
          className="pb-2 border-b border-white/[0.06] mb-2"
        />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
            textareaRef.current?.focus();
          }}
          className="flex items-end gap-1.5"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            multiple
            className="hidden"
            accept="image/*,.pdf,.txt,.log,.json,.md,.zip"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || isUploading}
            aria-label="Attach file or screenshot"
            title="Attach file or screenshot (or paste via Ctrl+V / Win+Shift+S)"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.08] bg-neutral-900/60 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900 transition-colors shrink-0 disabled:opacity-40"
          >
            <Paperclip className="h-3.5 w-3.5" />
          </button>

          <textarea
            ref={textareaRef}
            rows={1}
            placeholder="Ask orchestrator, request task, paste screenshot (Ctrl+V)..."
            aria-label="Ask orchestrator, request task, or paste screenshot"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!loading) {
                  handleSendMessage();
                }
                textareaRef.current?.focus();
              }
            }}
            className="flex-1 max-h-32 min-h-[34px] resize-none rounded-md border border-white/[0.08] bg-neutral-950 px-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 focus:border-blue-500/80 focus:outline-none transition-colors"
          />

          <button
            type="submit"
            disabled={loading || isUploading || (!input.trim() && attachments.length === 0)}
            aria-label="Send message to orchestrator"
            className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 transition-colors shrink-0 shadow-sm"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>

      {/* Wall Pin Undo Confirmation Modal */}
      {confirmWallPinRevertMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-white">Undo Chat Turn & Remove Wall Pins?</h3>
                <p className="mt-1 text-xs text-neutral-400 leading-relaxed">
                  This conversation turn created pin(s) on <strong className="text-neutral-200">The Wall</strong> by the Orchestrator. Undoing will roll back this conversation turn and remove these Orchestrator pins:
                </p>

                {/* List of affected pins */}
                <div className="my-3 space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {confirmWallPinRevertMsg.wallPins?.map((pin) => (
                    <div
                      key={pin.id}
                      className="flex items-center gap-2 rounded-lg bg-neutral-950/80 border border-neutral-800 px-3 py-2 text-xs text-neutral-200"
                    >
                      <Pin className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <span className="truncate font-medium">{pin.title}</span>
                    </div>
                  ))}
                </div>

                <p className="text-[11px] text-neutral-500">
                  Pins created by human users or manager reviews will <strong className="text-neutral-400">not</strong> be touched.
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-800/80">
              <button
                type="button"
                onClick={() => setConfirmWallPinRevertMsg(null)}
                className="px-3.5 py-1.5 rounded-xl border border-neutral-700 bg-neutral-800 text-xs font-medium text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetMsg = confirmWallPinRevertMsg;
                  setConfirmWallPinRevertMsg(null);
                  handleRevertTurn(targetMsg);
                }}
                disabled={loading || revertingMsgId === confirmWallPinRevertMsg.id}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-md shadow-amber-600/20 disabled:opacity-50 transition-colors"
              >
                {revertingMsgId === confirmWallPinRevertMsg.id ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Undoing...</span>
                  </>
                ) : (
                  <>
                    <Undo2 className="h-3.5 w-3.5" />
                    <span>Confirm & Undo</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
