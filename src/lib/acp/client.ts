import { ChildProcess, execSync, spawn } from 'child_process';
import readline from 'readline';
import {
  ACPClientOptions,
  ACPNotification,
  ACPRequest,
  ACPResponse,
  ACPUpdate,
  ACPUpdateType,
} from './types';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

export class ACPClient {
  private childProcess: ChildProcess;
  private readlineInterface: readline.Interface;
  private pendingRequests = new Map<number | string, PendingRequest>();
  private sessionUpdateCallbacks = new Map<string, (update: ACPUpdate) => void>();
  private nextRequestId = 1;
  private isProcessAlive = false;
  private cwd: string;

  // Spawns `opencode acp --auto` as a child process in the given cwd
  constructor(options: ACPClientOptions) {
    this.cwd = options.cwd;
    const isWin = process.platform === 'win32';
    const command = options.command || 'opencode';
    const args = options.args || ['acp'];

    this.childProcess = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
      },
      stdio: ['pipe', 'pipe', 'inherit'],
      shell: isWin,
    });

    if (!this.childProcess.stdout || !this.childProcess.stdin) {
      throw new Error('Failed to initialize ACP child process stdio streams');
    }

    this.isProcessAlive = true;

    this.readlineInterface = readline.createInterface({
      input: this.childProcess.stdout,
      crlfDelay: Infinity,
    });

    this.readlineInterface.on('line', (line: string) => {
      this.handleLine(line);
    });

    this.childProcess.on('error', (err: Error) => {
      this.handleProcessTermination(new Error(`ACP child process error: ${err.message}`));
    });

    this.childProcess.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      const reason = signal ? `killed with signal ${signal}` : `exited with code ${code}`;
      this.handleProcessTermination(new Error(`ACP child process ${reason}`));
    });
  }

  // Send JSON-RPC request and wait for response
  private sendRequest(method: string, params?: unknown): Promise<unknown> {
    if (!this.isAlive) {
      return Promise.reject(new Error('ACPClient child process is not alive'));
    }

    const id = this.nextRequestId++;
    const request: ACPRequest = {
      jsonrpc: '2.0',
      id,
      method,
      ...(params !== undefined ? { params } : {}),
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      try {
        this.sendRaw(JSON.stringify(request) + '\n');
      } catch (err) {
        this.pendingRequests.delete(id);
        reject(err);
      }
    });
  }

  // Send JSON-RPC notification
  private sendNotification(method: string, params?: unknown): void {
    if (!this.isAlive) {
      throw new Error('ACPClient child process is not alive');
    }

    const notification: ACPNotification = {
      jsonrpc: '2.0',
      method,
      ...(params !== undefined ? { params } : {}),
    };

    this.sendRaw(JSON.stringify(notification) + '\n');
  }

  // Send raw string over stdin
  private sendRaw(data: string): void {
    if (!this.childProcess.stdin || !this.childProcess.stdin.writable) {
      throw new Error('ACPClient child process stdin is not writable');
    }
    this.childProcess.stdin.write(data);
  }

  // Handle incoming line from stdout
  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let message: any;
    try {
      message = JSON.parse(trimmed);
    } catch {
      // Ignore non-JSON output from child process
      return;
    }

    // 1. JSON-RPC response to a client request
    if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(
            new Error(message.error.message || `ACP error: ${JSON.stringify(message.error)}`)
          );
        } else {
          pending.resolve(message.result);
        }
      }
      return;
    }

    // 2. Reverse request from Agent to Client (e.g. session/request_permission)
    if (message.id !== undefined && typeof message.method === 'string') {
      this.handleReverseRequest(message);
      return;
    }

    // 3. Notification from Agent to Client (e.g. session/update)
    if (typeof message.method === 'string') {
      this.handleNotification(message);
      return;
    }
  }

  // Handle reverse requests from agent by auto-approving permissions
  private handleReverseRequest(request: { id: number | string; method: string; params?: any }): void {
    if (request.method === 'session/request_permission') {
      const options: Array<{ optionId: string; kind?: string }> = request.params?.options || [];
      const allowOption =
        options.find(
          (opt) =>
            opt.kind === 'allow_always' ||
            opt.kind === 'allow_once' ||
            opt.kind === 'allow' ||
            opt.optionId === 'allow_once' ||
            opt.optionId === 'allow'
        ) || options[0];

      const optionId = allowOption?.optionId || 'allow_once';
      const response = {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          outcome: {
            outcome: 'selected',
            optionId,
          },
        },
      };

      try {
        this.sendRaw(JSON.stringify(response) + '\n');
      } catch (err) {
        console.error('Failed to auto-approve permission request:', err);
      }
      return;
    }

    // Acknowledge other unexpected reverse requests
    const defaultResponse = {
      jsonrpc: '2.0',
      id: request.id,
      result: {},
    };
    try {
      this.sendRaw(JSON.stringify(defaultResponse) + '\n');
    } catch {
      // ignore
    }
  }

  // Handle agent notifications
  private handleNotification(notification: { method: string; params?: any }): void {
    if (notification.method === 'session/update') {
      const sessionId = notification.params?.sessionId;
      const update = notification.params?.update;
      if (!sessionId || !update) return;

      const sessionUpdate = update.sessionUpdate;
      let type: ACPUpdateType | string = 'message_chunk';
      let content: unknown = update;

      if (sessionUpdate === 'agent_message_chunk') {
        type = 'message_chunk';
        content = update.content?.text ?? update.content ?? '';
      } else if (sessionUpdate === 'agent_thought_chunk') {
        type = 'thought_chunk';
        content = update.content?.text ?? update.content ?? '';
      } else if (sessionUpdate === 'tool_call') {
        type = 'tool_call';
        content = update.toolCall ?? update;
      } else if (sessionUpdate === 'tool_call_update') {
        type = 'tool_update';
        content = update.toolCall ?? update;
      } else if (typeof sessionUpdate === 'string') {
        type = sessionUpdate;
        content = update.content?.text ?? update.content ?? update;
      }

      const acpUpdate: ACPUpdate = {
        type,
        content,
        sessionId,
        raw: update,
      };

      const callback = this.sessionUpdateCallbacks.get(sessionId);
      if (callback) {
        try {
          callback(acpUpdate);
        } catch (err) {
          console.error(`Error in session/update callback for session ${sessionId}:`, err);
        }
      }
    }
  }

  // Handle termination/exit/errors
  private handleProcessTermination(error: Error): void {
    this.isProcessAlive = false;

    for (const [, pending] of this.pendingRequests.entries()) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
    this.sessionUpdateCallbacks.clear();
  }

  // Initialize the ACP connection
  async initialize(): Promise<void> {
    await this.sendRequest('initialize', {
      protocolVersion: 1,
      clientInfo: {
        name: 'software-factory',
        version: '0.1.0',
      },
      capabilities: {},
    });
  }

  // Create a new session
  async createSession(): Promise<string> {
    const result = (await this.sendRequest('session/new', {
      cwd: this.cwd,
      mcpServers: [],
    })) as { sessionId: string };

    if (!result || typeof result.sessionId !== 'string') {
      throw new Error('Failed to create session: no sessionId returned from ACP server');
    }

    return result.sessionId;
  }

  // Send a prompt and collect the full response (waits for end_turn)
  async prompt(sessionId: string, text: string): Promise<ACPResponse> {
    return this.promptStreaming(sessionId, text, () => {});
  }

  // Send a prompt and stream updates via callback
  async promptStreaming(
    sessionId: string,
    text: string,
    onUpdate: (update: ACPUpdate) => void
  ): Promise<ACPResponse> {
    let accumulatedContent = '';

    const streamCallback = (update: ACPUpdate) => {
      if (update.type === 'message_chunk' && typeof update.content === 'string') {
        accumulatedContent += update.content;
      }
      onUpdate(update);
    };

    this.sessionUpdateCallbacks.set(sessionId, streamCallback);

    try {
      const result = (await this.sendRequest('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text }],
      })) as {
        stopReason?: string;
        usage?: any;
        content?: any;
        [key: string]: any;
      };

      const finalContent =
        accumulatedContent ||
        (typeof result?.content === 'string'
          ? result.content
          : typeof result?.content?.text === 'string'
          ? result.content.text
          : '');

      return {
        stopReason: result?.stopReason || 'end_turn',
        content: finalContent,
        usage: result?.usage,
        raw: result,
      };
    } finally {
      this.sessionUpdateCallbacks.delete(sessionId);
    }
  }

  // Cancel a running prompt
  async cancel(sessionId: string): Promise<void> {
    this.sendNotification('session/cancel', { sessionId });
  }

  // Kill the child process
  destroy(): void {
    this.isProcessAlive = false;

    this.handleProcessTermination(new Error('ACPClient was destroyed'));

    if (this.readlineInterface) {
      try {
        this.readlineInterface.close();
      } catch {
        // ignore
      }
    }

    if (this.childProcess) {
      try {
        if (process.platform === 'win32' && this.childProcess.pid) {
          try {
            execSync(`taskkill /pid ${this.childProcess.pid} /T /F`, { stdio: 'ignore' });
          } catch {
            this.childProcess.kill();
          }
        } else {
          this.childProcess.kill('SIGTERM');
        }
      } catch {
        // ignore
      }
    }
  }

  // Check if process is alive
  get isAlive(): boolean {
    return this.isProcessAlive && !!this.childProcess && !this.childProcess.killed;
  }
}
