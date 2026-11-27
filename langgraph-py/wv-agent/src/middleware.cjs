'use strict';

/**
 * Connect/Express & Koa 2 dev middleware + Vite 5 plugin (Node 14+ compatible).
 * 1) Proxies ALL /__wv_agent__/* (GET/POST client.js + HTTP long-poll transport) -> 127.0.0.1:<hubPort>/*
 *    so phones NEVER need to connect to a second port (works behind proxies, firewalls, VPNs, HTTPS).
 * 2) Injects <script src="/__wv_agent__/client.js"></script> into dev HTML responses.
 *
 * Zero external dependencies. Safe to mount only in dev mode.
 */
const http = require('http');
const { createBridgeEsbuildPlugin } = require('./bridge-instrument.cjs');

function injectScriptTag(html, mountPath, scriptTag) {
  if (html.indexOf(mountPath + '/client.js') !== -1) {
    return html;
  }
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, function (m) {
      return m + '\n  ' + scriptTag;
    });
  }
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, '  ' + scriptTag + '\n</body>');
  }
  return html + '\n' + scriptTag;
}

function readStreamToString(stream) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    stream.on('data', function (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on('end', function () {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    stream.on('error', reject);
  });
}

function extractBufferedBody(req, koaRequest) {
  const method = String((req && req.method) || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') return null;

  if (koaRequest && typeof koaRequest.rawBody === 'string') {
    return Buffer.from(koaRequest.rawBody, 'utf8');
  }
  if (koaRequest && Buffer.isBuffer(koaRequest.rawBody)) {
    return koaRequest.rawBody;
  }
  const reqEnded = Boolean(
    req && (req.readableEnded || (req._readableState && req._readableState.ended))
  );
  if (koaRequest && koaRequest.body !== undefined && reqEnded) {
    const raw = typeof koaRequest.body === 'string'
      ? koaRequest.body
      : JSON.stringify(koaRequest.body);
    return Buffer.from(raw, 'utf8');
  }
  if (req && req.body !== undefined && reqEnded) {
    const rawReq = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    return Buffer.from(rawReq, 'utf8');
  }
  return null;
}

function proxyRequestToHub(req, res, opts) {
  return new Promise(function (resolve) {
    const reqUrl = opts.reqUrl;
    const mountPath = opts.mountPath;
    const hubHost = opts.hubHost;
    const hubPort = opts.hubPort;
    const targetPath = reqUrl.slice(mountPath.length) || '/';
    const targetPathname = new URL('http://localhost' + targetPath).pathname;

    if (targetPathname === '/observe' || targetPathname.indexOf('/observe/') === 0) {
      res.statusCode = 403;
      res.end('Open the observer directly on the local wv-agent hub.');
      resolve();
      return;
    }

    let settled = false;
    function done() {
      if (settled) return;
      settled = true;
      resolve();
    }
    res.once('finish', done);

    const isClientScript = targetPath === '/client.js' || targetPath.indexOf('/client.js?') === 0;
    const proxyPath = isClientScript
      ? '/client.js?port=' + hubPort + '&proxyPath=' + encodeURIComponent(mountPath)
      : targetPath;

    const forwardHeaders = Object.assign({}, req.headers);
    forwardHeaders.host = hubHost + ':' + hubPort;

    const bufferedBody = extractBufferedBody(req, opts.koaRequest);
    if (bufferedBody !== null) {
      delete forwardHeaders['transfer-encoding'];
      forwardHeaders['content-length'] = String(bufferedBody.length);
    }

    const proxyReq = http.request(
      {
        hostname: hubHost,
        port: hubPort,
        path: proxyPath,
        method: req.method || 'GET',
        headers: forwardHeaders,
        timeout: 25000,
      },
      function (proxyRes) {
        res.statusCode = proxyRes.statusCode || 200;
        const headers = proxyRes.headers || {};
        Object.keys(headers).forEach(function (k) {
          if (headers[k] !== undefined) {
            res.setHeader(k, headers[k]);
          }
        });
        res.setHeader('Cache-Control', 'no-store');
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', function () {
      if (res.headersSent) {
        try { res.end(); } catch (e) {}
        done();
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      if (isClientScript) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.end('/* wv-agent hub not running on port ' + hubPort + ' */');
      } else {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ ok: false, error: 'wv-agent hub not running on port ' + hubPort }));
      }
      done();
    });

    res.once('close', function () {
      const ended = res.writableEnded !== undefined ? res.writableEnded : res.finished;
      if (!ended) {
        try { proxyReq.destroy(); } catch (e) {}
      }
      done();
    });

    if (bufferedBody !== null) {
      proxyReq.end(bufferedBody);
    } else {
      req.pipe(proxyReq);
    }
  });
}

function createWvAgentMiddleware(options) {
  const opts = options || {};
  const mountPath = opts.mountPath || '/__wv_agent__';
  const hubHost = opts.hubHost || '127.0.0.1';
  const hubPort = Number(opts.hubPort || process.env.WV_AGENT_PORT || 19527);
  const onlyWhenEnv = opts.onlyWhenEnv === true;
  const scriptTag = '<script src="' + mountPath + '/client.js"></script>';

  return function wvAgentMiddleware(req, res, next) {
    if (onlyWhenEnv && process.env.WV_AGENT !== '1') {
      return next();
    }

    const reqUrl = String(req.url || '/');
    if (reqUrl === mountPath || reqUrl.indexOf(mountPath + '/') === 0) {
      proxyRequestToHub(req, res, {
        reqUrl: reqUrl,
        mountPath: mountPath,
        hubHost: hubHost,
        hubPort: hubPort,
      });
      return;
    }

    // Only consider HTML GET requests
    if (String(req.method || 'GET').toUpperCase() !== 'GET') {
      return next();
    }
    const accept = String((req.headers && req.headers.accept) || '');
    const isHtmlPath = /\.html?(\?|$)/i.test(reqUrl) || reqUrl === '/' || accept.indexOf('text/html') !== -1;
    if (!isHtmlPath) {
      return next();
    }

    // Prevent upstream gzip so we can inject cleanly in dev mode
    if (req.headers && req.headers['accept-encoding']) {
      delete req.headers['accept-encoding'];
    }

    const chunks = [];
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);
    const origSetHeader = res.setHeader.bind(res);
    let isHtmlResponse = false;

    function checkHtml() {
      const ct = String(res.getHeader('content-type') || '');
      return ct.indexOf('text/html') !== -1;
    }

    res.setHeader = function (name, value) {
      if (String(name).toLowerCase() === 'content-length') {
        return;
      }
      return origSetHeader(name, value);
    };

    res.write = function (chunk, encoding) {
      if (checkHtml()) {
        isHtmlResponse = true;
        if (chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
        }
        return true;
      }
      return origWrite.apply(res, arguments);
    };

    res.end = function (chunk, encoding) {
      if (isHtmlResponse || checkHtml()) {
        if (chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
        }
        const html = injectScriptTag(Buffer.concat(chunks).toString('utf8'), mountPath, scriptTag);
        const outBuf = Buffer.from(html, 'utf8');
        origSetHeader('Content-Length', outBuf.length);
        return origEnd(outBuf);
      }
      return origEnd.apply(res, arguments);
    };

    next();
  };
}

/**
 * Native Koa 2 middleware (Node 14+ compatible, works with koa-views / koa-static / koa-bodyparser).
 */
function createWvAgentKoaMiddleware(options) {
  const opts = options || {};
  const mountPath = opts.mountPath || '/__wv_agent__';
  const hubHost = opts.hubHost || '127.0.0.1';
  const hubPort = Number(opts.hubPort || process.env.WV_AGENT_PORT || 19527);
  const onlyWhenEnv = opts.onlyWhenEnv === true;
  const scriptTag = '<script src="' + mountPath + '/client.js"></script>';

  return async function wvAgentKoaMiddleware(ctx, next) {
    if (onlyWhenEnv && process.env.WV_AGENT !== '1') {
      return next();
    }

    const reqUrl = String(ctx.url || (ctx.req && ctx.req.url) || '/');
    if (reqUrl === mountPath || reqUrl.indexOf(mountPath + '/') === 0) {
      ctx.respond = false;
      await proxyRequestToHub(ctx.req, ctx.res, {
        reqUrl: reqUrl,
        mountPath: mountPath,
        hubHost: hubHost,
        hubPort: hubPort,
        koaRequest: ctx.request,
      });
      return;
    }

    const method = String(ctx.method || (ctx.req && ctx.req.method) || 'GET').toUpperCase();
    if (method !== 'GET') {
      return next();
    }

    const accept = String((ctx.headers && ctx.headers.accept) || '');
    const isHtmlPath = /\.html?(\?|$)/i.test(reqUrl) || reqUrl === '/' || accept.indexOf('text/html') !== -1;
    if (isHtmlPath && ctx.req && ctx.req.headers && ctx.req.headers['accept-encoding']) {
      delete ctx.req.headers['accept-encoding'];
    }

    await next();

    if (ctx.respond === false || ctx.body === undefined || ctx.body === null) {
      return;
    }

    const contentType = String(
      (ctx.response && typeof ctx.response.get === 'function' ? ctx.response.get('content-type') : '') ||
        ctx.type ||
        ''
    );
    if (contentType.indexOf('text/html') === -1) {
      return;
    }
    const contentEncoding = String(
      (ctx.response && typeof ctx.response.get === 'function' ? ctx.response.get('content-encoding') : '') || ''
    );
    if (contentEncoding) {
      return;
    }

    let html = null;
    if (typeof ctx.body === 'string') {
      html = ctx.body;
    } else if (Buffer.isBuffer(ctx.body)) {
      html = ctx.body.toString('utf8');
    } else if (ctx.body && typeof ctx.body.pipe === 'function') {
      html = await readStreamToString(ctx.body);
    }

    if (typeof html === 'string') {
      ctx.body = injectScriptTag(html, mountPath, scriptTag);
    }
  };
}

/**
 * Convenience wrapper for Vite 5 (e.g. subscribe/ctrm.mjs).
 * Uses Vite's native apply: 'serve' + transformIndexHtml so the probe loads before page JS
 * and is never included in production builds.
 */
function wvAgentVitePlugin(options) {
  const opts = options || {};
  const mountPath = opts.mountPath || '/__wv_agent__';
  const onlyWhenEnv = opts.onlyWhenEnv === true;
  const middleware = createWvAgentMiddleware(opts);
  return {
    name: 'wv-agent-dev-middleware',
    apply: 'serve',
    config: function () {
      if (onlyWhenEnv && process.env.WV_AGENT !== '1') return;
      return { optimizeDeps: { esbuildOptions: { plugins: [createBridgeEsbuildPlugin()] } } };
    },
    configureServer: function (server) {
      server.middlewares.use(middleware);
    },
    transformIndexHtml: function () {
      if (onlyWhenEnv && process.env.WV_AGENT !== '1') return;
      return [
        {
          tag: 'script',
          attrs: { src: mountPath + '/client.js' },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

const wvAgentWebpackPlugin = require('./webpack.cjs');

module.exports = createWvAgentMiddleware;
module.exports.createWvAgentMiddleware = createWvAgentMiddleware;
module.exports.createWvAgentKoaMiddleware = createWvAgentKoaMiddleware;
module.exports.wvAgentVitePlugin = wvAgentVitePlugin;
module.exports.wvAgentWebpackPlugin = wvAgentWebpackPlugin;
