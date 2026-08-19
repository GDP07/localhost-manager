import http from 'http';
import net from 'net';
import { HealthStatus } from '../../shared/types/service';

/**
 * How to probe a port:
 * - `http`  send a real GET; the only way to learn whether a web server answers.
 * - `tcp`   open a socket and close it. Used for databases and other binary protocols,
 *           where sending HTTP would log a protocol error on every poll.
 * - `skip`  do not probe. A UDP listener does not accept TCP, so probing it would
 *           report "unreachable" for a perfectly healthy service.
 */
export type ProbeMode = 'http' | 'tcp' | 'skip';

interface Probe {
  status: HealthStatus;
  responseTimeMs: number | null;
}

interface CacheEntry extends Probe {
  timestamp: number;
}

const PROBE_TIMEOUT_MS = 1500;

export class HealthService {
  private cache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 5000;

  async checkHealth(port: number, mode: ProbeMode = 'http', customPath = ''): Promise<Probe> {
    if (mode === 'skip') {
      return { status: 'unknown', responseTimeMs: null };
    }

    const key = `${mode}:${port}:${customPath}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return { status: cached.status, responseTimeMs: cached.responseTimeMs };
    }

    const result = mode === 'tcp' ? await this.probeTcp(port) : await this.probeHttp(port, customPath);
    this.cache.set(key, { ...result, timestamp: Date.now() });
    return result;
  }

  /** Accepting a TCP connection is all we can learn without speaking the protocol. */
  private probeTcp(port: number): Promise<Probe> {
    return new Promise((resolve) => {
      const start = Date.now();
      const socket = net.connect({ host: '127.0.0.1', port });
      let settled = false;

      const finish = (result: Probe) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(result);
      };

      socket.setTimeout(PROBE_TIMEOUT_MS);
      socket.once('connect', () => finish({ status: 'healthy', responseTimeMs: Date.now() - start }));
      socket.once('timeout', () => finish({ status: 'starting', responseTimeMs: null }));
      socket.once('error', (err: NodeJS.ErrnoException) =>
        finish({
          status: err.code === 'ECONNREFUSED' ? 'unreachable' : 'unknown',
          responseTimeMs: null
        })
      );
    });
  }

  private probeHttp(port: number, customPath: string): Promise<Probe> {
    return new Promise((resolve) => {
      const start = Date.now();
      const path = customPath.startsWith('/') ? customPath : `/${customPath}`;

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method: 'GET',
          timeout: PROBE_TIMEOUT_MS,
          headers: { 'User-Agent': 'LocalhostManager/1.0', Accept: '*/*' }
        },
        (res) => {
          const responseTimeMs = Date.now() - start;
          const statusCode = res.statusCode ?? 200;

          res.resume(); // drain, or the socket is never released
          res.once('end', () => {
            // A 5xx usually means the server is up but still compiling or misconfigured.
            resolve({
              status: statusCode >= 500 ? 'starting' : 'healthy',
              responseTimeMs
            });
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        // Connected but silent: typical of a dev server mid-build.
        resolve({ status: 'starting', responseTimeMs: null });
      });

      req.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
          resolve({ status: 'unreachable', responseTimeMs: null });
        } else if (err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.code === 'HPE_INVALID_CONSTANT') {
          // Something is listening, it just does not speak HTTP.
          resolve({ status: 'healthy', responseTimeMs: Date.now() - start });
        } else {
          resolve({ status: 'unknown', responseTimeMs: null });
        }
      });

      req.end();
    });
  }

  clearCache(): void {
    this.cache.clear();
  }
}
