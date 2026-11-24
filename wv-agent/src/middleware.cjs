'use strict';

/**
 * Connect-compatible dev middleware (works on Node 14+ Parcel/Express, Webpack 3/5, Vite 5).
 * 1) Proxies ALL /__wv_agent__/* (GET/POST client.js + HTTP long-poll transport) -> 127.0.0.1:<hubPort>/*
 *    so phones NEVER need to connect to a second port (works behind proxies, firewalls, VPNs, HTTPS).
 * 2) Injects <script src="/__wv_agent__/client.js"></script> into dev HTML responses.
 *
 * Zero external dependencies. Safe to mount only inside dev() / configureServer().
 */
const http = require('http');

function createWvAgentMiddleware(options) {
  const opts = options || {};
  const mountPath = opts.mountPath || '/__wv_agent__';
  const remoteUrl = opts.remoteUrl ? String(opts.remoteUrl).replace(/\/$/, '') : '';
  const hubHost = opts.hubHost || '127.0.0.1';
  const hubPort = Number(opts.hubPort || process.env.WV_AGENT_PORT || 19527);
  const onlyWhenEnv = opts.onlyWhenEnv === true;
  const scriptSrc = remoteUrl ? remoteUrl + '/client.js' : mountPath + '/client.js';
  const scriptTag = '<script src="' + scriptSrc + '"></script>';

  return function wvAgentMiddleware(req, res, next) {
    if (onlyWhenEnv && process.env.WV_AGENT !== '1') {
      return next();
    }

    const reqUrl = String(req.url || '/');
    if (!remoteUrl && (reqUrl === mountPath || reqUrl.indexOf(mountPath + '/') === 0)) {
      const targetPath = reqUrl.slice(mountPath.length) || '/';
      const isClientScript = targetPath === '/client.js' || targetPath.indexOf('/client.js?') === 0;
      const proxyPath = isClientScript
        ? '/client.js?port=' + hubPort + '&proxyPath=' + encodeURIComponent(mountPath)
        : targetPath;

      const forwardHeaders = Object.assign({}, req.headers);
      forwardHeaders.host = hubHost + ':' + hubPort;

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
      });

      req.pipe(proxyReq);
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
        let html = Buffer.concat(chunks).toString('utf8');
        if (html.indexOf(scriptSrc) === -1) {
          if (/<head[^>]*>/i.test(html)) {
            html = html.replace(/<head[^>]*>/i, function (m) {
              return m + '\n  ' + scriptTag;
            });
          } else if (/<\/body>/i.test(html)) {
            html = html.replace(/<\/body>/i, '  ' + scriptTag + '\n</body>');
          } else {
            html += '\n' + scriptTag;
          }
        }
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
 * Convenience wrapper for Vite 5 (e.g. subscribe/ctrm.mjs).
 * Uses Vite's native apply: 'serve' + transformIndexHtml so the probe loads before page JS
 * and is never included in production builds.
 */
function wvAgentVitePlugin(options) {
  const opts = options || {};
  const mountPath = opts.mountPath || '/__wv_agent__';
  const remoteUrl = opts.remoteUrl ? String(opts.remoteUrl).replace(/\/$/, '') : '';
  const scriptSrc = remoteUrl ? remoteUrl + '/client.js' : mountPath + '/client.js';
  const onlyWhenEnv = opts.onlyWhenEnv === true;
  const middleware = createWvAgentMiddleware(opts);
  return {
    name: 'wv-agent-dev-middleware',
    apply: 'serve',
    configureServer: function (server) {
      server.middlewares.use(middleware);
    },
    transformIndexHtml: function () {
      if (onlyWhenEnv && process.env.WV_AGENT !== '1') return;
      return [
        {
          tag: 'script',
          attrs: { src: scriptSrc },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

module.exports = createWvAgentMiddleware;
module.exports.createWvAgentMiddleware = createWvAgentMiddleware;
module.exports.wvAgentVitePlugin = wvAgentVitePlugin;
