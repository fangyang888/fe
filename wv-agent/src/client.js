/**
 * wv-agent in-page probe client (ES5 compatible for Android 4+ / iOS 8+ / HarmonyOS ArkWeb).
 * Automatically hooks window.MeiYouJSBridge, collects console/error/network events,
 * and communicates with wv-agent hub over same-origin HTTP long-polling (when loaded via middleware)
 * or direct WebSocket.
 */
(function () {
  if (window.__WV_AGENT_LOADED__) return;
  window.__WV_AGENT_LOADED__ = true;

  var DEFAULT_PORT = 19527;
  var cfg = window.__WV_AGENT_CONFIG__ || {};
  var hubPort = cfg.port || DEFAULT_PORT;
  var proxyPath = cfg.proxyPath || '';
  var useHttpPoll = !cfg.wsUrl && !!proxyPath;

  // Capture raw fetch/XHR before hooking so our own transport is never logged
  var rawFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
  var RawXHR = typeof XMLHttpRequest !== 'undefined' ? XMLHttpRequest : null;

  function isInternalTransportUrl(url) {
    var u = String(url || '');
    if (u.indexOf('/__wv_agent__') !== -1) return true;
    if (proxyPath && u.indexOf(proxyPath + '/poll/') === 0) return true;
    return false;
  }

  function httpRequest(method, url, body, onDone) {
    if (rawFetch) {
      var init = { method: method, cache: 'no-store' };
      if (body !== undefined) {
        init.headers = { 'Content-Type': 'application/json' };
        init.body = JSON.stringify(body);
      }
      rawFetch(url, init)
        .then(function (r) { return r.json(); })
        .then(function (data) { onDone && onDone(null, data); })
        .catch(function (err) { onDone && onDone(err || new Error('fetch failed')); });
      return;
    }
    if (!RawXHR) {
      onDone && onDone(new Error('No HTTP client available'));
      return;
    }
    var xhr = new RawXHR();
    xhr.__wvInternal = true;
    xhr.open(method, url, true);
    if (body !== undefined) {
      xhr.setRequestHeader('Content-Type', 'application/json');
    }
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          onDone && onDone(null, JSON.parse(xhr.responseText || '{}'));
        } catch (e) {
          onDone && onDone(e);
        }
      } else {
        onDone && onDone(new Error('HTTP ' + xhr.status));
      }
    };
    xhr.onerror = function () { onDone && onDone(new Error('XHR network error')); };
    xhr.send(body !== undefined ? JSON.stringify(body) : null);
  }

  function detectPlatform(ua) {
    var s = String(ua || '');
    if (/OpenHarmony|HarmonyOS|ArkWeb/i.test(s)) return 'harmony';
    if (/iPhone|iPad|iPod|iOS/i.test(s)) return 'ios';
    if (/Android/i.test(s)) return 'android';
    return 'web';
  }

  function getOrCreateClientId() {
    var key = '__wv_agent_client_id__';
    var plat = detectPlatform(navigator.userAgent);
    try {
      var existing = sessionStorage.getItem(key);
      if (existing && existing.indexOf(plat + '-') === 0) return existing;
      var id = plat + '-' + Math.random().toString(36).slice(2, 8);
      sessionStorage.setItem(key, id);
      return id;
    } catch (e) {
      return plat + '-' + Math.random().toString(36).slice(2, 8);
    }
  }

  function resolveWsUrl() {
    if (cfg.wsUrl) return cfg.wsUrl;
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var host = location.hostname || '127.0.0.1';
    return proto + '//' + host + ':' + hubPort + '/ws';
  }

  function safeClone(val, depth) {
    depth = depth || 0;
    if (depth > 4) return '[MaxDepth]';
    if (val === null || val === undefined) return val;
    var t = typeof val;
    if (t === 'string') return val.length > 4000 ? val.slice(0, 4000) + '...[truncated]' : val;
    if (t === 'number' || t === 'boolean') return val;
    if (t === 'function') return '[Function]';
    if (val instanceof Error) {
      return { name: val.name, message: val.message, stack: String(val.stack || '').slice(0, 1500) };
    }
    if (Array.isArray(val)) {
      var arr = [];
      for (var i = 0; i < Math.min(val.length, 50); i++) {
        arr.push(safeClone(val[i], depth + 1));
      }
      return arr;
    }
    try {
      var out = {};
      var keys = Object.keys(val);
      for (var j = 0; j < Math.min(keys.length, 50); j++) {
        var k = keys[j];
        out[k] = safeClone(val[k], depth + 1);
      }
      return out;
    } catch (e) {
      return String(val);
    }
  }

  function stringifyArg(v) {
    if (typeof v === 'string') return v;
    try {
      return JSON.stringify(safeClone(v));
    } catch (e) {
      return String(v);
    }
  }

  var clientId = cfg.clientId || getOrCreateClientId();
  var platform = detectPlatform(navigator.userAgent);
  var ws = null;
  var pendingEvents = [];
  var flushTimer = null;
  var refMap = {};
  var rawBridgeInvoke = null;
  var rawBridgeOn = null;
  var traceSeq = 1;

  function emitEvent(type, payload) {
    var msg = {
      type: 'event',
      eventType: type,
      clientId: clientId,
      ts: Date.now(),
      payload: payload,
    };
    if (!useHttpPoll && ws && ws.readyState === 1) {
      try {
        ws.send(JSON.stringify(msg));
        return;
      } catch (e) {}
    }
    pendingEvents.push(msg);
    if (pendingEvents.length > 200) pendingEvents.shift();
    if (useHttpPoll && !flushTimer) {
      flushTimer = setTimeout(flushHttpEvents, 150);
    }
  }

  function flushWsEvents() {
    if (!ws || ws.readyState !== 1) return;
    while (pendingEvents.length > 0) {
      var item = pendingEvents.shift();
      try {
        ws.send(JSON.stringify(item));
      } catch (e) {
        pendingEvents.unshift(item);
        break;
      }
    }
  }

  function flushHttpEvents() {
    flushTimer = null;
    if (!useHttpPoll || pendingEvents.length === 0) return;
    var batch = pendingEvents.splice(0, 50);
    httpRequest('POST', proxyPath + '/poll/push', { clientId: clientId, events: batch }, function (err) {
      if (err) {
        pendingEvents = batch.concat(pendingEvents).slice(-200);
      }
      if (pendingEvents.length > 0 && !flushTimer) {
        flushTimer = setTimeout(flushHttpEvents, 500);
      }
    });
  }

  function getDeviceMeta() {
    return {
      clientId: clientId,
      platform: platform,
      ua: navigator.userAgent,
      url: location.href,
      title: document.title || '',
      hasBridge: !!(window.MeiYouJSBridge && typeof window.MeiYouJSBridge.invoke === 'function'),
      viewport: {
        width: window.innerWidth || 0,
        height: window.innerHeight || 0,
        dpr: window.devicePixelRatio || 1,
      },
    };
  }

  // ===== 0. Auto Replay Shim for PC Browser (?bridgeDebug=replay) =====
  // When viewing on PC browser without native MeiYouJSBridge, automatically replay from meetyou.bridge-debug
  function installBridgeDebugReplayIfNeeded() {
    if (window.MeiYouJSBridge) return;
    var search = String(location.search || '');
    var modeMatch = search.match(/[?&]bridgeDebug=([^&]+)/);
    var mode = modeMatch ? decodeURIComponent(modeMatch[1]) : '';
    if (mode !== 'replay' && mode !== '1') return;

    var serverMatch = search.match(/[?&]bridgeDebugServer=([^&]+)/);
    var server = serverMatch ? decodeURIComponent(serverMatch[1]).replace(/\/$/, '') : '';
    var logEnabled = search.indexOf('bridgeDebugLog=1') !== -1;

    window.MeiYouJSBridge = {
      config: function () {},
      invoke: function (path, params, callback) {
        var qs = 'path=' + encodeURIComponent(String(path || '')) + '&params=' + encodeURIComponent(JSON.stringify(params || {}));
        var url = server + '/__bridge-debug__/invoke?' + qs;
        httpRequest('GET', url, undefined, function (err, payload) {
          var data = (!err && payload && payload.ok && payload.data !== undefined) ? payload.data : {};
          if (logEnabled && window.console) {
            console.log('[wv-agent replay] invoke', path, params || {}, '=>', data, payload && payload.ok ? '(hit)' : '(miss)');
          }
          if (typeof callback === 'function') {
            callback(path, data);
          }
        });
      },
      on: function (path, params, callback) {
        if (logEnabled && window.console) {
          console.log('[wv-agent replay] on', path, params || {});
        }
      },
    };
    if (logEnabled && window.console) {
      console.log('[wv-agent replay] MeiYouJSBridge replay shim installed (server=' + (server || 'same-origin') + ')');
    }
    try {
      window.dispatchEvent(new Event('MeiYouJSBridgeReady'));
    } catch (e) {}
  }

  installBridgeDebugReplayIfNeeded();

  // ===== 1. Hook window.MeiYouJSBridge (Zero-intrusion for @meetyou/toolbox & meetyou.bridge) =====
  function hookMeiYouBridge() {
    var bridge = window.MeiYouJSBridge;
    if (!bridge || bridge.__wvAgentHooked__) return !!bridge;
    bridge.__wvAgentHooked__ = true;

    if (typeof bridge.invoke === 'function') {
      rawBridgeInvoke = bridge.invoke.bind(bridge);
      bridge.invoke = function (path, params, callback) {
        var id = traceSeq++;
        var startedAt = Date.now();
        var cleanParams = safeClone(params || {});
        if (typeof callback !== 'function') {
          emitEvent('bridge_trace', {
            id: id,
            kind: 'invoke',
            source: 'page',
            path: String(path || ''),
            params: cleanParams,
            status: 'fire_and_forget',
            durationMs: 0,
            url: location.href,
          });
          return rawBridgeInvoke(path, params, callback);
        }
        var wrappedCb = function (cbPath, data) {
          emitEvent('bridge_trace', {
            id: id,
            kind: 'invoke',
            source: 'page',
            path: String(path || ''),
            cbPath: cbPath,
            params: cleanParams,
            data: safeClone(data),
            status: 'resolved',
            durationMs: Date.now() - startedAt,
            url: location.href,
          });
          return callback.apply(this, arguments);
        };
        return rawBridgeInvoke(path, params, wrappedCb);
      };
    }

    if (typeof bridge.on === 'function') {
      rawBridgeOn = bridge.on.bind(bridge);
      bridge.on = function (path, params, callback) {
        var id = traceSeq++;
        var cleanParams = safeClone(params || {});
        if (typeof callback !== 'function') {
          return rawBridgeOn(path, params, callback);
        }
        var wrappedCb = function (cbPath, data) {
          emitEvent('bridge_trace', {
            id: id,
            kind: 'event',
            source: 'page',
            path: String(path || ''),
            cbPath: cbPath,
            params: cleanParams,
            data: safeClone(data),
            status: 'event',
            durationMs: 0,
            url: location.href,
          });
          return callback.apply(this, arguments);
        };
        return rawBridgeOn(path, params, wrappedCb);
      };
    }

    emitEvent('meta', getDeviceMeta());
    return true;
  }

  hookMeiYouBridge();
  window.addEventListener('MeiYouJSBridgeReady', hookMeiYouBridge, false);
  document.addEventListener('MeiYouJSBridgeReady', hookMeiYouBridge, false);
  var hookTimerCount = 0;
  var hookTimer = setInterval(function () {
    hookTimerCount++;
    if (hookMeiYouBridge() || hookTimerCount >= 50) {
      clearInterval(hookTimer);
    }
  }, 200);

  function waitForBridge(maxWaitMs, done) {
    if (hookMeiYouBridge() && rawBridgeInvoke) {
      done(true);
      return;
    }
    var deadline = Date.now() + (maxWaitMs || 3000);
    var t = setInterval(function () {
      if (hookMeiYouBridge() && rawBridgeInvoke) {
        clearInterval(t);
        done(true);
      } else if (Date.now() >= deadline) {
        clearInterval(t);
        done(false);
      }
    }, 100);
  }

  function callBridge(opts, reply) {
    var path = String(opts.path || '');
    var params = opts.params || {};
    var timeoutMs = Number(opts.timeoutMs || 8000);
    if (!path) {
      reply({ status: 'error', error: 'path is required' });
      return;
    }

    waitForBridge(Math.min(timeoutMs, 2000), function (ok) {
      if (!ok || !rawBridgeInvoke) {
        reply({
          status: 'no_bridge',
          path: path,
          params: params,
          error: 'window.MeiYouJSBridge is not available in current WebView',
        });
        return;
      }

      var id = traceSeq++;
      var startedAt = Date.now();
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        var res = {
          id: id,
          kind: 'invoke',
          source: 'agent',
          path: path,
          params: safeClone(params),
          status: 'timeout',
          durationMs: Date.now() - startedAt,
          error: 'Bridge callback timed out after ' + timeoutMs + 'ms',
          url: location.href,
        };
        emitEvent('bridge_trace', res);
        reply(res);
      }, timeoutMs);

      try {
        rawBridgeInvoke(path, params, function (cbPath, data) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          var res = {
            id: id,
            kind: 'invoke',
            source: 'agent',
            path: path,
            cbPath: cbPath,
            params: safeClone(params),
            data: safeClone(data),
            status: 'resolved',
            durationMs: Date.now() - startedAt,
            url: location.href,
          };
          emitEvent('bridge_trace', res);
          reply(res);
        });
      } catch (err) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        var resErr = {
          id: id,
          kind: 'invoke',
          source: 'agent',
          path: path,
          params: safeClone(params),
          status: 'error',
          durationMs: Date.now() - startedAt,
          error: err && err.message ? err.message : String(err),
          url: location.href,
        };
        emitEvent('bridge_trace', resErr);
        reply(resErr);
      }
    });
  }

  // ===== 2. Console, Error & Network Instrumentation =====
  ['error', 'warn'].forEach(function (level) {
    var orig = console[level];
    if (typeof orig !== 'function') return;
    console[level] = function () {
      try {
        var parts = [];
        for (var i = 0; i < arguments.length; i++) {
          parts.push(stringifyArg(arguments[i]));
        }
        emitEvent('console', { level: level, text: parts.join(' ').slice(0, 2000), url: location.href });
      } catch (e) {}
      return orig.apply(console, arguments);
    };
  });

  window.addEventListener('error', function (e) {
    emitEvent('page_error', {
      message: e && e.message ? e.message : 'Script error',
      filename: e && e.filename ? e.filename : '',
      lineno: e && e.lineno ? e.lineno : 0,
      colno: e && e.colno ? e.colno : 0,
      stack: e && e.error && e.error.stack ? String(e.error.stack).slice(0, 1500) : '',
      url: location.href,
    });
  });

  window.addEventListener('unhandledrejection', function (e) {
    var reason = e ? e.reason : null;
    emitEvent('page_error', {
      message: 'UnhandledRejection: ' + (reason && reason.message ? reason.message : stringifyArg(reason)),
      stack: reason && reason.stack ? String(reason.stack).slice(0, 1500) : '',
      url: location.href,
    });
  });

  if (rawFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (isInternalTransportUrl(url)) return rawFetch(input, init);
      var method = (init && init.method) || (typeof input !== 'string' && input && input.method) || 'GET';
      var startedAt = Date.now();
      return rawFetch(input, init).then(
        function (resp) {
          emitEvent('network', {
            kind: 'fetch',
            method: String(method).toUpperCase(),
            url: url,
            status: resp.status,
            ok: resp.ok,
            durationMs: Date.now() - startedAt,
          });
          return resp;
        },
        function (err) {
          emitEvent('network', {
            kind: 'fetch',
            method: String(method).toUpperCase(),
            url: url,
            status: 0,
            ok: false,
            error: err && err.message ? err.message : String(err),
            durationMs: Date.now() - startedAt,
          });
          throw err;
        }
      );
    };
  }

  if (RawXHR) {
    var origOpen = RawXHR.prototype.open;
    var origSend = RawXHR.prototype.send;
    RawXHR.prototype.open = function (method, url) {
      this.__wvNet = { method: String(method || 'GET').toUpperCase(), url: String(url || '') };
      return origOpen.apply(this, arguments);
    };
    RawXHR.prototype.send = function () {
      var self = this;
      var meta = self.__wvNet;
      if (!self.__wvInternal && meta && !isInternalTransportUrl(meta.url)) {
        var startedAt = Date.now();
        self.addEventListener('loadend', function () {
          emitEvent('network', {
            kind: 'xhr',
            method: meta.method,
            url: meta.url,
            status: self.status,
            ok: self.status >= 200 && self.status < 400,
            durationMs: Date.now() - startedAt,
          });
        });
      }
      return origSend.apply(this, arguments);
    };
  }

  // ===== 3. Lightweight DOM Snapshot & H5 Action Executor =====
  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    var style = window.getComputedStyle(el);
    if (!style || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    var rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isInteractive(el) {
    var tag = el.tagName.toLowerCase();
    if (tag === 'button' || tag === 'a' || tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    var role = el.getAttribute('role');
    if (role && /^(button|link|tab|checkbox|radio|switch|menuitem|option)$/.test(role)) return true;
    if (el.getAttribute('data-testid')) return true;
    if (typeof el.onclick === 'function' || el.hasAttribute('onclick')) return true;
    var cls = typeof el.className === 'string' ? el.className : '';
    if (/\b(btn|button|tab|submit|confirm|cancel|close|action)\b/i.test(cls)) return true;
    var style = window.getComputedStyle(el);
    if (style && style.cursor === 'pointer') return true;
    return false;
  }

  function buildSnapshot(opts) {
    var maxElements = Number((opts && opts.maxElements) || 120);
    refMap = {};
    var elements = [];
    var all = document.querySelectorAll('body *');
    var idx = 1;

    for (var i = 0; i < all.length && elements.length < maxElements; i++) {
      var el = all[i];
      if (!isInteractive(el) || !isVisible(el)) continue;
      var ref = 'e' + idx++;
      refMap[ref] = el;
      var rect = el.getBoundingClientRect();
      var text = (el.innerText || el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
      elements.push({
        ref: ref,
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role') || undefined,
        type: el.getAttribute('type') || undefined,
        text: text.slice(0, 120),
        value: 'value' in el && el.value !== undefined && el.tagName !== 'LI' ? String(el.value).slice(0, 120) : undefined,
        placeholder: el.getAttribute('placeholder') || undefined,
        testId: el.getAttribute('data-testid') || undefined,
        disabled: !!el.disabled,
        rect: {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        },
      });
    }

    var bodyText = (document.body && document.body.innerText ? document.body.innerText : '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1500);

    return {
      meta: getDeviceMeta(),
      scroll: {
        x: Math.round(window.scrollX || 0),
        y: Math.round(window.scrollY || 0),
        height: document.documentElement ? document.documentElement.scrollHeight : 0,
      },
      elementCount: elements.length,
      elements: elements,
      bodyTextPreview: bodyText,
    };
  }

  function resolveElement(opts) {
    if (opts.ref && refMap[opts.ref]) return refMap[opts.ref];
    if (opts.selector) return document.querySelector(opts.selector);
    if (opts.text) {
      var all = document.querySelectorAll('button, a, [role="button"], span, div');
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (!isVisible(el)) continue;
        var t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        if (t === opts.text || t.indexOf(opts.text) !== -1) return el;
      }
    }
    return null;
  }

  function setNativeInputValue(el, value) {
    var proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && typeof desc.set === 'function') {
      desc.set.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function runAction(opts) {
    var action = String(opts.action || '');
    if (action === 'reload') {
      setTimeout(function () { location.reload(); }, 50);
      return { ok: true, action: 'reload' };
    }
    if (action === 'back') {
      history.back();
      return { ok: true, action: 'back' };
    }
    if (action === 'scroll') {
      var dx = Number(opts.dx || 0);
      var dy = Number(opts.dy !== undefined ? opts.dy : 400);
      window.scrollBy(dx, dy);
      return { ok: true, action: 'scroll', scrollY: Math.round(window.scrollY || 0) };
    }

    var el = resolveElement(opts);
    if (!el) {
      return { ok: false, error: 'Element not found (run snapshot first or pass selector/text)' };
    }

    if (typeof el.scrollIntoView === 'function') {
      try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (e) {}
    }

    if (action === 'click') {
      if (typeof el.focus === 'function') el.focus();
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      el.click();
      return { ok: true, action: 'click', tag: el.tagName.toLowerCase(), text: (el.innerText || '').trim().slice(0, 80) };
    }

    if (action === 'fill') {
      if (typeof el.focus === 'function') el.focus();
      setNativeInputValue(el, String(opts.value !== undefined ? opts.value : ''));
      return { ok: true, action: 'fill', value: String(opts.value !== undefined ? opts.value : '') };
    }

    return { ok: false, error: 'Unsupported action: ' + action };
  }

  function runEval(opts, reply) {
    var expr = String(opts.expression || '');
    if (!expr) {
      reply({ ok: false, error: 'expression is required' });
      return;
    }
    try {
      var fn = new Function('return (async function(){ return (' + expr + '); })();');
      Promise.resolve(fn()).then(
        function (val) { reply({ ok: true, value: safeClone(val) }); },
        function (err) { reply({ ok: false, error: err && err.message ? err.message : String(err) }); }
      );
    } catch (err) {
      try {
        var fnStmt = new Function('return (async function(){ ' + expr + ' })();');
        Promise.resolve(fnStmt()).then(
          function (val) { reply({ ok: true, value: safeClone(val) }); },
          function (err2) { reply({ ok: false, error: err2 && err2.message ? err2.message : String(err2) }); }
        );
      } catch (err3) {
        reply({ ok: false, error: err3 && err3.message ? err3.message : String(err3) });
      }
    }
  }

  // ===== 4. Command Dispatcher & Dual Transport (Same-Origin HTTP Poll / WebSocket) =====
  function sendRpcReply(reqId, result, error) {
    var payload = {
      type: 'response',
      reqId: reqId,
      ok: !error,
      result: result,
      error: error || undefined,
    };
    if (useHttpPoll) {
      httpRequest('POST', proxyPath + '/poll/push', { clientId: clientId, response: payload });
    } else if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(payload));
    }
  }

  function handleCommand(msg) {
    var reqId = msg.reqId;
    var cmd = msg.cmd;
    var payload = msg.payload || {};

    function reply(result, error) {
      sendRpcReply(reqId, result, error);
    }

    if (cmd === 'meta') {
      reply(getDeviceMeta());
    } else if (cmd === 'snapshot') {
      reply(buildSnapshot(payload));
    } else if (cmd === 'act') {
      reply(runAction(payload));
    } else if (cmd === 'eval') {
      runEval(payload, function (res) { reply(res); });
    } else if (cmd === 'bridge.call') {
      callBridge(payload, function (res) { reply(res); });
    } else {
      reply(null, 'Unknown command: ' + cmd);
    }
  }

  function startHttpPollLoop() {
    var retryDelay = 500;
    var polling = false;

    function registerAndPoll() {
      httpRequest('POST', proxyPath + '/poll/register', { meta: getDeviceMeta() }, function (err) {
        if (err) {
          setTimeout(registerAndPoll, retryDelay);
          retryDelay = Math.min(retryDelay * 1.5, 4000);
          return;
        }
        retryDelay = 500;
        flushHttpEvents();
        if (!polling) pollNext();
      });
    }

    function pollNext() {
      polling = true;
      httpRequest('GET', proxyPath + '/poll/next?clientId=' + encodeURIComponent(clientId), undefined, function (err, data) {
        polling = false;
        if (err) {
          setTimeout(registerAndPoll, 1000);
          return;
        }
        var cmds = (data && data.commands) || [];
        for (var i = 0; i < cmds.length; i++) {
          handleCommand(cmds[i]);
        }
        setTimeout(pollNext, 20);
      });
    }

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && !polling) {
        registerAndPoll();
      }
    });

    registerAndPoll();
  }

  function startWsLoop() {
    var reconnectDelay = 500;
    function connect() {
      var wsUrl = resolveWsUrl();
      try {
        ws = new WebSocket(wsUrl);
      } catch (e) {
        setTimeout(connect, reconnectDelay);
        return;
      }

      ws.onopen = function () {
        reconnectDelay = 500;
        ws.send(JSON.stringify({ type: 'register', meta: getDeviceMeta() }));
        flushWsEvents();
      };

      ws.onmessage = function (ev) {
        var msg;
        try {
          msg = JSON.parse(ev.data);
        } catch (e) {
          return;
        }
        if (msg && msg.type === 'command') {
          handleCommand(msg);
        }
      };

      ws.onclose = function () {
        ws = null;
        setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 1.5, 5000);
      };

      ws.onerror = function () {
        try { ws && ws.close(); } catch (e) {}
      };
    }
    connect();
  }

  if (useHttpPoll) {
    startHttpPollLoop();
  } else {
    startWsLoop();
  }

  window.__WV_AGENT_API__ = {
    getClientId: function () { return clientId; },
    getMeta: getDeviceMeta,
    snapshot: buildSnapshot,
    callBridge: function (path, params, timeoutMs) {
      return new Promise(function (resolve) {
        callBridge({ path: path, params: params, timeoutMs: timeoutMs }, resolve);
      });
    },
  };
})();
