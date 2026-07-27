import type { Logger } from '../../../application/ports/logger';

type Level = 'debug' | 'info' | 'warn' | 'error';

/** Default {@link Logger}: structured-ish lines on stdout/stderr. */
export class ConsoleLogger implements Logger {
  constructor(private readonly minimumLevel: Level = 'info') {}

  debug(message: string, context?: Record<string, unknown>): void {
    this.write('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.write('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.write('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.write('error', message, context);
  }

  private write(level: Level, message: string, context?: Record<string, unknown>): void {
    const order: Level[] = ['debug', 'info', 'warn', 'error'];
    if (order.indexOf(level) < order.indexOf(this.minimumLevel)) return;

    const suffix = context && Object.keys(context).length ? ` ${JSON.stringify(context)}` : '';
    const line = `[${level.toUpperCase()}] ${message}${suffix}`;

    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  }
}
