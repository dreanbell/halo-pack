// WebSocket mínimo (RFC 6455, solo texto), sin dependencias.
import crypto from 'node:crypto';

const MAX_FRAME = 1 << 20;

export class Conn {
  constructor(socket, onMessage, onClose) {
    this.socket = socket;
    this.onMessage = onMessage;
    this.onClose = onClose;
    this.buf = Buffer.alloc(0);
    this.frag = [];
    this.closed = false;
    this.lastSeen = Date.now();
    socket.on('data', (d) => { this.lastSeen = Date.now(); this.buf = Buffer.concat([this.buf, d]); this.parse(); });
    socket.on('close', () => this.finish());
    socket.on('error', () => this.finish());
  }

  parse() {
    while (!this.closed && this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0, op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2); off = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        const big = this.buf.readBigUInt64BE(2);
        if (big > BigInt(MAX_FRAME)) { this.close(1009); return; }
        len = Number(big); off = 10;
      }
      if (len > MAX_FRAME) { this.close(1009); return; }
      if (!masked) { this.close(1002); return; } // los clientes siempre enmascaran
      if (this.buf.length < off + 4 + len) return;
      const mask = this.buf.subarray(off, off + 4);
      const data = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + 4 + len);

      if (op === 0x8) { this.close(1000); return; }
      if (op === 0x9) { this.frame(0xa, data); continue; }
      if (op === 0xa) continue;
      if (op === 0x1 || op === 0x0) {
        this.frag.push(data);
        if (this.frag.reduce((n, b) => n + b.length, 0) > MAX_FRAME) { this.close(1009); return; }
        if (fin) {
          const text = Buffer.concat(this.frag).toString('utf8');
          this.frag = [];
          this.onMessage(this, text);
        }
      }
      // Binario u otros opcodes: se ignoran.
    }
  }

  frame(op, payload) {
    if (this.closed || !this.socket.writable) return;
    const n = payload.length;
    let head;
    if (n < 126) head = Buffer.from([0x80 | op, n]);
    else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(n, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
    this.socket.write(Buffer.concat([head, payload]));
  }

  send(obj) { this.frame(0x1, Buffer.from(JSON.stringify(obj), 'utf8')); }

  close(code = 1000) {
    if (this.closed) return;
    const b = Buffer.alloc(2);
    b.writeUInt16BE(code, 0);
    this.frame(0x8, b);
    this.socket.end();
    this.finish();
  }

  finish() {
    if (this.closed) return;
    this.closed = true;
    this.socket.destroy();
    this.onClose(this);
  }
}

// Acepta el «upgrade» HTTP → WebSocket en `path`; onOpen(conn) recibe cada conexión nueva.
export function acceptWebSocket(server, path, onOpen, onMessage, onClose) {
  server.on('upgrade', (req, socket) => {
    let pathname = '';
    try { pathname = new URL(req.url, 'http://x').pathname; } catch { /* url inválida */ }
    const key = req.headers['sec-websocket-key'];
    if (pathname !== path || String(req.headers.upgrade).toLowerCase() !== 'websocket' || !key) { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`, '', ''].join('\r\n'));
    socket.setNoDelay(true);
    onOpen(new Conn(socket, onMessage, onClose));
  });
}
