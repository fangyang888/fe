import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/**
 * Encode an unmasked server->client WebSocket frame (RFC 6455).
 */
export function encodeFrame(payload, opcode = 0x1) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
  const len = data.length;
  let header;

  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  return Buffer.concat([header, data]);
}

/**
 * Minimal zero-dependency RFC 6455 WebSocket connection wrapper.
 */
export class WsConnection extends EventEmitter {
  constructor(socket, req) {
    super();
    this.socket = socket;
    this.req = req;
    this.closed = false;
    this.buffer = Buffer.alloc(0);
    this.fragmentOpcode = null;
    this.fragmentChunks = [];

    socket.on('data', (chunk) => this._onData(chunk));
    socket.on('close', () => this._handleClose());
    socket.on('error', (err) => {
      this.emit('error', err);
      this._handleClose();
    });
  }

  send(text) {
    if (this.closed || this.socket.destroyed) return false;
    try {
      this.socket.write(encodeFrame(text, 0x1));
      return true;
    } catch {
      return false;
    }
  }

  sendJson(obj) {
    return this.send(JSON.stringify(obj));
  }

  ping(payload = '') {
    if (this.closed || this.socket.destroyed) return;
    try {
      this.socket.write(encodeFrame(payload, 0x9));
    } catch {
      // ignore
    }
  }

  close(code = 1000, reason = '') {
    if (this.closed) return;
    this.closed = true;
    try {
      const reasonBuf = Buffer.from(reason, 'utf8');
      const buf = Buffer.alloc(2 + reasonBuf.length);
      buf.writeUInt16BE(code, 0);
      reasonBuf.copy(buf, 2);
      this.socket.write(encodeFrame(buf, 0x8));
    } catch {
      // ignore
    }
    try {
      this.socket.end();
    } catch {
      // ignore
    }
    this.emit('close');
  }

  _handleClose() {
    if (this.closed) return;
    this.closed = true;
    this.emit('close');
  }

  _onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= 2) {
      const byte0 = this.buffer[0];
      const byte1 = this.buffer[1];
      const fin = (byte0 & 0x80) !== 0;
      const opcode = byte0 & 0x0f;
      const masked = (byte1 & 0x80) !== 0;
      let payloadLen = byte1 & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (this.buffer.length < offset + 2) return;
        payloadLen = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (payloadLen === 127) {
        if (this.buffer.length < offset + 8) return;
        const bigLen = this.buffer.readBigUInt64BE(offset);
        if (bigLen > BigInt(32 * 1024 * 1024)) {
          this.close(1009, 'Message too large');
          return;
        }
        payloadLen = Number(bigLen);
        offset += 8;
      }

      const maskLen = masked ? 4 : 0;
      if (this.buffer.length < offset + maskLen + payloadLen) return;

      let maskKey = null;
      if (masked) {
        maskKey = this.buffer.subarray(offset, offset + 4);
        offset += 4;
      }

      const payload = Buffer.from(this.buffer.subarray(offset, offset + payloadLen));
      this.buffer = this.buffer.subarray(offset + payloadLen);

      if (masked && maskKey) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskKey[i & 3];
        }
      }

      // Control frames
      if (opcode === 0x8) {
        this.close(1000);
        return;
      }
      if (opcode === 0x9) {
        // Ping -> Pong
        if (!this.closed && !this.socket.destroyed) {
          this.socket.write(encodeFrame(payload, 0xA));
        }
        continue;
      }
      if (opcode === 0xA) {
        this.emit('pong', payload);
        continue;
      }

      // Data frames (text / binary / continuation)
      if (opcode === 0x0) {
        if (this.fragmentOpcode === null) continue;
        this.fragmentChunks.push(payload);
        if (fin) {
          const full = Buffer.concat(this.fragmentChunks);
          const op = this.fragmentOpcode;
          this.fragmentOpcode = null;
          this.fragmentChunks = [];
          if (op === 0x1) this.emit('message', full.toString('utf8'));
        }
      } else if (opcode === 0x1 || opcode === 0x2) {
        if (fin) {
          if (opcode === 0x1) this.emit('message', payload.toString('utf8'));
        } else {
          this.fragmentOpcode = opcode;
          this.fragmentChunks = [payload];
        }
      }
    }
  }
}

/**
 * Attach a WebSocket upgrade handler to an existing Node http.Server.
 */
export function attachWebSocketServer(httpServer, { path = '/ws', onConnection }) {
  httpServer.on('upgrade', (req, socket, head) => {
    let pathname = '/';
    try {
      pathname = new URL(req.url || '/', 'http://localhost').pathname;
    } catch {
      socket.destroy();
      return;
    }

    if (pathname !== path) {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    const accept = crypto
      .createHash('sha1')
      .update(key + WS_GUID)
      .digest('base64');

    const headers = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '',
      '',
    ].join('\r\n');

    socket.write(headers);
    socket.setNoDelay(true);

    const conn = new WsConnection(socket, req);
    if (head && head.length > 0) {
      conn._onData(head);
    }
    onConnection(conn, req);
  });
}
