const devicePicker = document.querySelector('#device');
const statusLabel = document.querySelector('#status');
const pageLabel = document.querySelector('#page');
const timeline = document.querySelector('#timeline');
const list = document.querySelector('#events');
const emptyLabel = document.querySelector('#empty');
const maxEvents = 300;
const callbackWaitMs = 10000;
const dateFormat = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

let devices = [];
let stream = null;
let streamReady = false;
let hubReachable = true;
const entries = [];
const bridgeCalls = new Map();

function updateStatus() {
  const device = devices.find((candidate) => candidate.clientId === devicePicker.value);
  let text = '等待手机连接';
  let state = '';
  if (!hubReachable) {
    text = 'Hub 连接断开，正在重试';
    state = 'error';
  } else if (device && !device.connected) {
    text = '设备已离线';
    state = 'error';
  } else if (device && !streamReady) {
    text = '正在连接事件流…';
  } else if (device) {
    text = '正在接收事件';
    if (!device.hasBridge) text += ' · Bridge 未就绪';
    else if (device.bridgeCapture === 'readonly') text += ' · Bridge 只读，当前缺少 SDK 采集';
    else if (device.bridgeCapture === 'sdk') text += ' · 通过 JS SDK 采集 Bridge';
    state = 'online';
  }
  statusLabel.textContent = text;
  statusLabel.dataset.state = state;
  pageLabel.textContent = device?.url || '';
  pageLabel.hidden = !pageLabel.textContent;
}

function updateEmptyState() {
  emptyLabel.hidden = entries.length > 0;
  emptyLabel.textContent = devicePicker.value
    ? '在手机上操作，点击和回包会出现在这里。'
    : '请在手机 App 中打开接入 wv-agent 的开发页。';
}

function shouldShowEvent({ type, item }) {
  if (type === 'network') return false;
  if (type !== 'bridge_start' && type !== 'bridge_trace') return true;

  const path = String(item.path || '').trim().replace(/^\/+|\/+$/g, '').toLowerCase();
  return path !== 'ga' && path !== 'mobclick' && path !== 'http' && !path.startsWith('http/');
}

function describeEvent({ type, item }) {
  switch (type) {
    case 'interaction':
      return ['点击', '', item.label || item.testId || `<${item.tag || 'element'}>`];
    case 'bridge_start':
      return [item.source === 'agent' ? 'Bridge 调试' : 'Bridge', 'bridge', `${item.path} 已发起`];
    case 'bridge_trace': {
      if (item.status === 'error') return ['Bridge', 'problem', `${item.path} 调用失败 · ${item.error || ''}`];
      if (item.status === 'timeout') return ['Bridge', 'problem', `${item.path} 回调超时`];
      if (item.status === 'event') return ['Bridge', 'bridge', `${item.path} 原生事件`];
      if (item.status === 'fire_and_forget') return ['Bridge', 'bridge', `${item.path} 已调用 · 无回调参数`];
      const duration = Number.isFinite(item.durationMs) ? ` · ${item.durationMs} ms` : '';
      return ['Bridge', 'bridge', `${item.path} 已回包${duration}`];
    }
    case 'page_error':
      return ['JS 异常', 'problem', item.message || 'Script error'];
    case 'console':
      return [`Console ${item.level || ''}`, 'problem', item.text || ''];
    default:
      return [type, '', ''];
  }
}

function updateBridgeStatus(call) {
  if (!call.start) return;
  const late = !call.end && Date.now() - call.start.event.receivedAt >= callbackWaitMs;
  call.start.state.dataset.state = late ? 'late' : '';
  const endStatus = call.end?.event.item.status;
  const completed = { error: '调用失败', timeout: '回调超时', resolved: '已回包' };
  call.start.state.textContent = completed[endStatus] || (late ? '超过 10 秒未回调' : '等待原生回调');
}

function appendEvent(event) {
  if (!shouldShowEvent(event)) return false;

  const { item, type } = event;
  const [label, tone, description] = describeEvent(event);
  const row = document.createElement('li');
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  const time = document.createElement('time');
  const timestamp = new Date(typeof item.ts === 'number' ? item.ts : event.receivedAt);
  if (Number.isFinite(timestamp.getTime())) {
    time.dateTime = timestamp.toISOString();
    time.textContent = `${dateFormat.format(timestamp)}.${String(timestamp.getMilliseconds()).padStart(3, '0')}`;
  }
  const badge = document.createElement('span');
  badge.className = `event-type ${tone}`;
  badge.textContent = label;
  const message = document.createElement('span');
  message.className = 'event-message';
  message.textContent = description;
  const state = document.createElement('small');
  if (type === 'bridge_start') message.append(state);
  summary.append(time, badge, message);
  details.append(summary);
  details.addEventListener('toggle', function showPayload() {
    if (!details.open) return;
    const payload = document.createElement('pre');
    payload.textContent = JSON.stringify(item, null, 2);
    details.append(payload);
    details.removeEventListener('toggle', showPayload);
  });
  row.append(details);
  list.append(row);

  const phase = type === 'bridge_start' ? 'start' :
    (type === 'bridge_trace' && ['resolved', 'error', 'timeout'].includes(item.status) ? 'end' : '');
  const key = phase && item.documentId ? `${item.documentId}:${item.id}` : '';
  const entry = { row, key, phase, state, event };
  entries.push(entry);
  if (key) {
    const call = bridgeCalls.get(key) || {};
    call[phase] = entry;
    bridgeCalls.set(key, call);
    updateBridgeStatus(call);
  }

  if (entries.length > maxEvents) {
    const removed = entries.shift();
    removed.row.remove();
    const call = bridgeCalls.get(removed.key);
    if (call?.[removed.phase] === removed) {
      delete call[removed.phase];
      if (!call.start && !call.end) bridgeCalls.delete(removed.key);
    }
  }
  return true;
}

function showSnapshot(events) {
  entries.length = 0;
  bridgeCalls.clear();
  list.replaceChildren();
  for (const event of events) appendEvent(event);
  updateEmptyState();
  timeline.scrollTop = timeline.scrollHeight;
}

function watchDevice(clientId) {
  stream?.close();
  stream = null;
  streamReady = false;
  updateStatus();
  showSnapshot([]);
  if (!clientId) return;

  const source = new EventSource(`/observe/events?device=${encodeURIComponent(clientId)}`);
  stream = source;
  source.addEventListener('snapshot', (message) => {
    if (source !== stream) return;
    streamReady = true;
    showSnapshot(JSON.parse(message.data));
    updateStatus();
  });
  source.addEventListener('activity', (message) => {
    if (source !== stream) return;
    const nearLatest = timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < 44;
    if (!appendEvent(JSON.parse(message.data))) return;
    updateEmptyState();
    if (nearLatest) timeline.scrollTop = timeline.scrollHeight;
  });
  source.addEventListener('error', () => {
    if (source !== stream) return;
    streamReady = false;
    updateStatus();
  });
}

async function refreshDevices() {
  try {
    const response = await fetch('/api/devices', { cache: 'no-store' });
    if (!response.ok) throw new Error('Hub unavailable');
    const body = await response.json();
    devices = body.devices.filter((device) => device.platform !== 'web' && device.platform !== 'unknown');
    hubReachable = true;
    const previous = devicePicker.value;
    const selected = devices.some((device) => device.clientId === previous)
      ? previous
      : devices.find((device) => device.connected)?.clientId || '';
    const options = [new Option(devices.length ? '选择手机' : '等待设备', '')];
    for (const device of devices) {
      options.push(new Option(`${device.clientId}${device.connected ? '' : ' · 离线'}`, device.clientId));
    }
    if (devicePicker.options.length !== options.length || options.some((option, index) =>
      devicePicker.options[index]?.text !== option.text || devicePicker.options[index]?.value !== option.value)) {
      devicePicker.replaceChildren(...options);
    }
    devicePicker.disabled = devices.length === 0;
    devicePicker.value = selected;
    if (selected !== previous || (selected && stream?.readyState === EventSource.CLOSED)) watchDevice(selected);
  } catch {
    hubReachable = false;
  } finally {
    updateStatus();
    setTimeout(refreshDevices, 1500);
  }
}

devicePicker.addEventListener('change', () => watchDevice(devicePicker.value));
setInterval(() => {
  for (const call of bridgeCalls.values()) {
    if (!call.end) updateBridgeStatus(call);
  }
}, 500);
refreshDevices();
