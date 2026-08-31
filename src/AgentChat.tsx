import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import './AgentChat.css';
import { streamAgentMessage, type CustomerServiceEvent } from './agent-stream';

type MessageRole = 'user' | 'assistant';

type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
  time: string;
  model?: string;
  createdAt?: number;
};

type AgentHistoryMessage = {
  role: MessageRole;
  content: string;
  status: 'pending' | 'completed' | 'failed';
  model: string | null;
  createdAt: number;
};

type ChatMode = 'general' | 'elk';
type SuggestionIconName = 'calculator' | 'clock' | 'sparkles';
type Suggestion = {
  label: string;
  prompt: string;
  icon: SuggestionIconName;
};
type ElkChatResponse = {
  reply?: unknown;
  model?: unknown;
  message?: string | string[];
};
type AdminLoginResponse = {
  token?: unknown;
  userInfo?: { id?: unknown };
  message?: string | string[];
};

const ACTIVE_CONVERSATION_KEY = 'agent.activeConversationId';

function getOrCreateConversationId(): string {
  const existing = localStorage.getItem(ACTIVE_CONVERSATION_KEY);
  if (existing) return existing;

  const created = crypto.randomUUID();
  localStorage.setItem(ACTIVE_CONVERSATION_KEY, created);
  return created;
}

const suggestions: readonly Suggestion[] = [
  {
    label: '计算 125 × 8',
    prompt: '请使用计算器工具计算 125 乘以 8。',
    icon: 'calculator',
  },
  { label: '上海现在几点？', prompt: '请告诉我上海现在几点。', icon: 'clock' },
  {
    label: '介绍你的能力',
    prompt: '请简要介绍你现在能做什么。',
    icon: 'sparkles',
  },
];

const elkSuggestions: readonly Suggestion[] = [
  {
    label: '打开 Kibana 登录窗口',
    prompt: '请打开 Kibana 登录窗口。',
    icon: 'sparkles',
  },
  {
    label: '查询业务域名 5xx',
    prompt: '请查询我在 ELK 白名单中配置的业务域名最近 15 分钟的 5xx 错误；如果没有默认域名，请先向我确认。',
    icon: 'calculator',
  },
  {
    label: '统计页面今日访问量',
    prompt: '请统计 /puzzle/template.html 今天的访问量。',
    icon: 'clock',
  },
  {
    label: 'ELK 助手能做什么？',
    prompt: '请介绍当前 ELK 日志助手支持的查询范围和使用条件。',
    icon: 'clock',
  },
];

let messageSequence = 0;

function createMessage(
  role: MessageRole,
  content: string,
  model?: string,
  createdAt?: number,
): ChatMessage {
  messageSequence += 1;
  const messageTime = createdAt ? new Date(createdAt) : new Date();
  return {
    id: `${Date.now()}-${messageSequence}`,
    role,
    content,
    time: new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(messageTime),
    model,
  };
}

function createInitialMessages(): ChatMessage[] {
  return [createMessage('assistant', '你好，我是你的 AI 助手。想先了解什么？')];
}

function RobotIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v3" />
      <circle cx="12" cy="2.5" r="1" />
      <rect x="4" y="6" width="16" height="13" rx="4" />
      <path d="M8 19v2m8-2v2M4 11H2m20 0h-2" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="15" cy="12" r="1" />
      <path d="M9 16h6" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m21 3-7.4 18-3.2-7.4L3 10.4 21 3Z" />
      <path d="m10.4 13.6 4.2-4.2" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7" />
      <path d="M10 11v6m4-6v6" />
    </svg>
  );
}

function SuggestionIcon({ name }: { name: SuggestionIconName }) {
  if (name === 'calculator') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M8 7h8v3H8zm0 7h2m4 0h2m-8 3h2m4 0h2" />
      </svg>
    );
  }

  if (name === 'clock') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z" />
      <path d="m18 14 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z" />
    </svg>
  );
}

function MessageRow({ message }: { message: ChatMessage }) {
  const isAssistant = message.role === 'assistant';
  const contentParts = message.content.split(/(\*\*[^*\n]+\*\*)/g);

  return (
    <div className={`agent-message-row ${isAssistant ? 'is-assistant' : 'is-user'}`}>
      {isAssistant ? (
        <div className="agent-avatar">
          <RobotIcon />
        </div>
      ) : null}
      <div className="agent-message-stack">
        <div className="agent-message-bubble">
          {contentParts.map((part, index) =>
            part.startsWith('**') && part.endsWith('**') ? (
              <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>
            ) : (
              part
            ),
          )}
        </div>
        <div className="agent-message-meta">
          <span>{message.time}</span>
          {message.model ? <span>· {message.model}</span> : null}
        </div>
      </div>
    </div>
  );
}

export default function AgentChat() {
  const [mode, setMode] = useState<ChatMode>('general');
  const [elkToken, setElkToken] = useState('');
  const [elkLoginOpen, setElkLoginOpen] = useState(false);
  const [elkUsername, setElkUsername] = useState('');
  const [elkPassword, setElkPassword] = useState('');
  const [elkLoginLoading, setElkLoginLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(createInitialMessages);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(true);
  const requestRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // conversationId 同时用作后端多轮状态的 thread_id，统一使用标准 UUID v4。
  const conversationIdRef = useRef(getOrCreateConversationId());
  const clientMessageIdRef = useRef(crypto.randomUUID());
  const [stageText, setStageText] = useState('');
  const activeRunRef = useRef<{
    runId: string | null;
    lastSeq: number;
    assistantMessageId: string;
    terminal: 'none' | 'completed' | 'failed' | 'cancelled';
    done: boolean;
  } | null>(null);
  const pendingDeltaRef = useRef('');
  const flushFrameRef = useRef<number | null>(null);
  useEffect(() => {
    document.body.classList.add('agent-chat-active');
    return () => document.body.classList.remove('agent-chat-active');
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: messages.length > 1 ? 'smooth' : 'auto',
      block: 'end',
    });
  }, [messages, loading]);

  useEffect(() => {
    return () => {
      requestRef.current?.abort();
      if (flushFrameRef.current !== null) {
        cancelAnimationFrame(flushFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void fetch(`/api/agent/conversations/${conversationIdRef.current}/messages`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (response.status === 404) return [];
        if (!response.ok) throw new Error('加载聊天历史失败');
        return response.json() as Promise<AgentHistoryMessage[]>;
      })
      .then((records) => {
        if (!Array.isArray(records) || records.length === 0) return;

        setMessages([
          createInitialMessages()[0],
          ...records
            .filter((record) => record.status === 'completed')
            .map((record) =>
              createMessage(
                record.role,
                record.content,
                record.model ?? undefined,
                record.createdAt,
              ),
            ),
        ]);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setError(error instanceof Error ? error.message : '加载历史失败');
      });

    return () => controller.abort();
  }, []);
  const appendAssistantDelta = (messageId: string, delta: string) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, content: message.content + delta } : message,
      ),
    );
  };

  const replaceAssistantFinal = (messageId: string, content: string, model: string) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, content, model } : message,
      ),
    );
  };

  const clearPendingDelta = () => {
    pendingDeltaRef.current = '';
    if (flushFrameRef.current !== null) {
      cancelAnimationFrame(flushFrameRef.current);
      flushFrameRef.current = null;
    }
  };

  const handleStreamEvent = (event: CustomerServiceEvent) => {
    const active = activeRunRef.current;

    if (!active) return;
    if (active.done) return;

    if (event.type === 'run_started' && active.runId === null) {
      active.runId = event.runId;
    }

    if (active.runId !== event.runId) return;
    if (event.seq <= active.lastSeq) return;
    active.lastSeq = event.seq;

    switch (event.type) {
      case 'status':
        setStageText(event.message);
        break;
      case 'tool_started':
        setStageText(`正在使用${event.displayName}`);
        break;
      case 'tool_finished':
        setStageText(event.summary);
        break;
      case 'assistant_delta':
        if (!event.delta) break;

        pendingDeltaRef.current += event.delta;
        if (flushFrameRef.current === null) {
          const assistantMessageId = active.assistantMessageId;
          flushFrameRef.current = requestAnimationFrame(() => {
            const delta = pendingDeltaRef.current;
            pendingDeltaRef.current = '';
            flushFrameRef.current = null;
            if (delta) appendAssistantDelta(assistantMessageId, delta);
          });
        }
        break;
      case 'assistant_final':
        clearPendingDelta();
        replaceAssistantFinal(active.assistantMessageId, event.content, event.model);
        setStageText('');
        setConnected(true);
        active.terminal = 'completed';
        break;
      case 'run_failed':
        setError(event.message);
        setStageText('');
        setConnected(false);
        active.terminal = 'failed';
        setMessages((current) =>
          current.filter(
            (item) => item.id !== active.assistantMessageId || item.content.length > 0,
          ),
        );
        break;
      case 'run_cancelled':
        setStageText('已停止');
        active.terminal = 'cancelled';
        break;
      case 'done':
        active.done = true;
        setStageText('');
        break;
      case 'run_started':
        setStageText('已收到问题');
        break;
    }
  };
  const sendMessage = async (value: string) => {
    const message = value.trim();
    if (!message || loading) {
      return;
    }
    if (mode === 'elk' && !elkToken) {
      setError('请先登录项目账号，再使用 ELK 日志助手。');
      setElkLoginOpen(true);
      return;
    }

    const controller = new AbortController();
    requestRef.current = controller;
    setDraft('');
    setError('');
    setLoading(true);
    setStageText(mode === 'elk' ? '正在查询 ELK 日志…' : '正在连接服务…');

    const assistantMessage = createMessage('assistant', '');
    activeRunRef.current = {
      runId: null,
      lastSeq: 0,
      assistantMessageId: assistantMessage.id,
      terminal: 'none',
      done: false,
    };
    setMessages((current) => [...current, createMessage('user', message), assistantMessage]);

    try {
      if (mode === 'elk') {
        const response = await fetch('/api/agent/elk/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${elkToken}`,
          },
          body: JSON.stringify({ message }),
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => null)) as ElkChatResponse | null;

        if (!response.ok) {
          const detail = Array.isArray(data?.message) ? data.message.join('；') : data?.message;
          throw new Error(detail || `ELK 请求失败（HTTP ${response.status}）`);
        }
        if (typeof data?.reply !== 'string') {
          throw new Error('ELK 服务返回了无法识别的结果');
        }

        replaceAssistantFinal(
          assistantMessage.id,
          data.reply,
          typeof data.model === 'string' ? data.model : 'ELK Agent',
        );
        setConnected(true);
      } else {
        await streamAgentMessage({
          message,
          conversationId: conversationIdRef.current,
          clientMessageId: clientMessageIdRef.current,
          signal: controller.signal,
          onEvent: handleStreamEvent,
        });
      }
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === 'AbortError') {
        setStageText('已停止');
        setMessages((current) =>
          current.filter(
            (item) => item.id !== assistantMessage.id || item.content.length > 0,
          ),
        );
        return;
      }

      setConnected(false);
      setError(requestError instanceof Error ? requestError.message : 'Agent 请求失败，请稍后重试');
      setMessages((current) =>
        current.filter(
          (item) => item.id !== assistantMessage.id || item.content.length > 0,
        ),
      );
    } finally {
      if (requestRef.current === controller) {
        clearPendingDelta();
        clientMessageIdRef.current = crypto.randomUUID();
        requestRef.current = null;
        activeRunRef.current = null;
        setStageText('');
        setLoading(false);
      }
    }
  };

  const clearConversation = () => {
    requestRef.current?.abort();
    clearPendingDelta();
    requestRef.current = null;
    const nextId = crypto.randomUUID();
    conversationIdRef.current = nextId;
    localStorage.setItem(ACTIVE_CONVERSATION_KEY, nextId);
    clientMessageIdRef.current = crypto.randomUUID();
    setMessages(createInitialMessages());
    setDraft('');
    setError('');
    setStageText('');
    activeRunRef.current = null;
    setLoading(false);
    inputRef.current?.focus();
  };

  const loginElk = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!elkUsername.trim() || !elkPassword || elkLoginLoading) return;

    setElkLoginLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: elkUsername.trim(), password: elkPassword }),
      });
      const data = (await response.json().catch(() => null)) as AdminLoginResponse | null;
      if (!response.ok) {
        const detail = Array.isArray(data?.message) ? data.message.join('；') : data?.message;
        throw new Error(detail || `登录失败（HTTP ${response.status}）`);
      }
      if (typeof data?.token !== 'string' || !data.token) {
        throw new Error('登录接口未返回有效令牌');
      }

      setElkToken(data.token);
      setElkPassword('');
      setElkLoginOpen(false);
      setConnected(true);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : '项目账号登录失败');
    } finally {
      setElkLoginLoading(false);
    }
  };

  const changeMode = (nextMode: ChatMode) => {
    if (nextMode === mode) return;
    requestRef.current?.abort();
    clearPendingDelta();
    requestRef.current = null;
    activeRunRef.current = null;
    setMode(nextMode);
    setElkLoginOpen(false);
    setMessages([
      createMessage(
        'assistant',
        nextMode === 'elk'
          ? '你好，我是 ELK 日志助手。请先确认 Kibana 已登录，并提供业务域名；我可以查询 5xx 样本或按 url_path 统计访问量。'
          : '你好，我是你的 AI 助手。想先了解什么？',
      ),
    ]);
    setDraft('');
    setError('');
    setStageText('');
    setLoading(false);
    setConnected(true);
    inputRef.current?.focus();
  };

  const stopCurrentRun = () => {
    requestRef.current?.abort();
    setStageText('正在停止…');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(draft);
    }
  };

  return (
    <main className="agent-chat-page">
      <div className="agent-chat-topbar">
        <div className="agent-topbar-actions">
          <div className="agent-mode-switch" role="group" aria-label="助手模式">
            <button
              className={mode === 'general' ? 'is-active' : ''}
              type="button"
              onClick={() => changeMode('general')}
              aria-pressed={mode === 'general'}
            >
              普通助手
            </button>
            <button
              className={mode === 'elk' ? 'is-active' : ''}
              type="button"
              onClick={() => changeMode('elk')}
              aria-pressed={mode === 'elk'}
            >
              ELK 日志助手
            </button>
          </div>
          {mode === 'elk' ? (
            <button
              className={`agent-elk-login-button ${elkToken ? 'is-authenticated' : ''}`}
              type="button"
              onClick={() => setElkLoginOpen(true)}
            >
              {elkToken ? '项目已登录' : '项目账号登录'}
            </button>
          ) : null}
        </div>
        <div className={`agent-service-status ${connected ? '' : 'has-error'}`}>
          <span aria-hidden="true" />
          {connected ? (mode === 'elk' ? 'ELK 服务已连接' : '服务已连接') : '连接异常'}
        </div>
      </div>

      <div className="agent-chat-layout">
        <header className="agent-chat-heading">
          <h1>{mode === 'elk' ? 'ELK 日志助手' : 'AI 智能助手'}</h1>
          <p>
            {mode === 'elk'
              ? '通过 Kibana 查询 5xx 日志，并按 URL 路径统计访问量，辅助定位问题'
              : '用自然语言提问，Agent 会在需要时调用工具'}
          </p>
        </header>

        <section className="agent-chat-shell" aria-label="AI 助手对话">
          <div className="agent-message-list">
            <MessageRow message={messages[0]} />

            <div className="agent-suggestions" aria-label="示例问题">
              {(mode === 'elk' ? elkSuggestions : suggestions).map((suggestion) => (
                <button
                  key={suggestion.label}
                  type="button"
                  onClick={() => void sendMessage(suggestion.prompt)}
                  disabled={loading}
                >
                  <SuggestionIcon name={suggestion.icon} />
                  <span>{suggestion.label}</span>
                </button>
              ))}
            </div>

            {messages.slice(1).map((message) =>
              message.content ? <MessageRow key={message.id} message={message} /> : null,
            )}

            {loading && stageText ? (
              <div className="agent-stream-status" role="status">
                <span className="agent-spinner" aria-hidden="true" />
                <span>{stageText}</span>
              </div>
            ) : null}

            <div ref={endRef} />
          </div>

          <form
            className="agent-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage(draft);
            }}
          >
            {error ? (
              <div className="agent-error" role="alert">
                {error}
              </div>
            ) : null}

            <label className="agent-visually-hidden" htmlFor="agent-message-input">
              输入你的问题
            </label>
            <textarea
              ref={inputRef}
              id="agent-message-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入你的问题…"
              maxLength={8000}
              rows={2}
              disabled={loading}
            />

            <div className="agent-composer-actions">
              <button className="agent-clear-button" type="button" onClick={clearConversation}>
                <TrashIcon />
                <span>清空对话</span>
              </button>

              {loading ? (
                <button
                  className="agent-stop-button"
                  type="button"
                  onClick={stopCurrentRun}
                  aria-label="停止当前回答"
                >
                  停止回答
                </button>
              ) : (
                <button className="agent-send-button" type="submit" disabled={!draft.trim()}>
                  <SendIcon />
                  <span>发送</span>
                </button>
              )}
            </div>
          </form>
        </section>

        <p className="agent-mode-note">
          <span aria-hidden="true">ⓘ</span>
          {mode === 'elk'
            ? 'ELK 查询需要先在独立 Kibana 窗口完成登录，并使用已配置白名单中的业务域名'
            : '当前为单轮模式，每次提问独立处理'}
        </p>
      </div>

      {elkLoginOpen ? (
        <div className="agent-modal-backdrop">
          <section className="agent-login-modal" role="dialog" aria-modal="true" aria-labelledby="elk-login-title">
            <div className="agent-login-modal-heading">
              <div>
                <p className="agent-login-eyebrow">ELK 日志助手</p>
                <h2 id="elk-login-title">登录项目后台账号</h2>
              </div>
              <button
                className="agent-login-close"
                type="button"
                onClick={() => setElkLoginOpen(false)}
                aria-label="关闭登录窗口"
              >
                ×
              </button>
            </div>
            <p className="agent-login-help">
              仅用于获取当前项目 JWT，不会把 Kibana 密码发送给 ELK 服务。
            </p>
            <form className="agent-login-form" onSubmit={loginElk}>
              <label htmlFor="elk-username">后台账号</label>
              <input
                id="elk-username"
                autoComplete="username"
                value={elkUsername}
                onChange={(event) => setElkUsername(event.target.value)}
                disabled={elkLoginLoading}
              />
              <label htmlFor="elk-password">后台密码</label>
              <input
                id="elk-password"
                type="password"
                autoComplete="current-password"
                value={elkPassword}
                onChange={(event) => setElkPassword(event.target.value)}
                disabled={elkLoginLoading}
              />
              <button type="submit" disabled={elkLoginLoading || !elkUsername.trim() || !elkPassword}>
                {elkLoginLoading ? '登录中…' : '登录并继续'}
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
