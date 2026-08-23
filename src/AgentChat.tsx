import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
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

const ACTIVE_CONVERSATION_KEY = 'agent.activeConversationId';

function getOrCreateConversationId(): string {
  const existing = localStorage.getItem(ACTIVE_CONVERSATION_KEY);
  if (existing) return existing;

  const created = crypto.randomUUID();
  localStorage.setItem(ACTIVE_CONVERSATION_KEY, created);
  return created;
}

const suggestions = [
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
] as const;

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

function SuggestionIcon({ name }: { name: (typeof suggestions)[number]['icon'] }) {
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
  } | null>(null);
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
    return () => requestRef.current?.abort();
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
  const handleStreamEvent = (event: CustomerServiceEvent) => {
    const active = activeRunRef.current;

    if (!active) return;

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
        appendAssistantDelta(active.assistantMessageId, event.delta);
        break;
      case 'assistant_final':
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

    const controller = new AbortController();
    requestRef.current = controller;
    setMessages((current) => [...current, createMessage('user', message)]);
    setDraft('');
    setError('');
    setLoading(true);
    setStageText('正在连接服务…');

    const assistantMessage = createMessage('assistant', '');
    activeRunRef.current = {
      runId: null,
      lastSeq: 0,
      assistantMessageId: assistantMessage.id,
      terminal: 'none',
    };
    setMessages((current) => [...current, assistantMessage]);

    try {
      await streamAgentMessage({
        message,
        conversationId: conversationIdRef.current,
        clientMessageId: clientMessageIdRef.current,
        signal: controller.signal,
        onEvent: handleStreamEvent,
      });
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === 'AbortError') {
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

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(draft);
    }
  };

  return (
    <main className="agent-chat-page">
      <div className="agent-chat-topbar">
        <div className={`agent-service-status ${connected ? '' : 'has-error'}`}>
          <span aria-hidden="true" />
          {connected ? '服务已连接' : '连接异常'}
        </div>
      </div>

      <div className="agent-chat-layout">
        <header className="agent-chat-heading">
          <h1>AI 智能助手</h1>
          <p>用自然语言提问，Agent 会在需要时调用工具</p>
        </header>

        <section className="agent-chat-shell" aria-label="AI 助手对话">
          <div className="agent-message-list" aria-live="polite">
            <MessageRow message={messages[0]} />

            <div className="agent-suggestions" aria-label="示例问题">
              {suggestions.map((suggestion) => (
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

            {loading ? (
              <div className="agent-message-row is-assistant" aria-label="Agent 正在回答">
                <div className="agent-avatar">
                  <RobotIcon />
                </div>
                <div className="agent-loading-bubble">
                  <span className="agent-spinner" aria-hidden="true" />
                  <span>{stageText || '正在思考并调用工具…'}</span>
                </div>
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

              <button
                className="agent-send-button"
                type="submit"
                disabled={loading || !draft.trim()}
              >
                <SendIcon />
                <span>{loading ? '回答中' : '发送'}</span>
              </button>
            </div>
          </form>
        </section>

        <p className="agent-mode-note">
          <span aria-hidden="true">ⓘ</span>
          当前为单轮模式，每次提问独立处理
        </p>
      </div>
    </main>
  );
}
