// Hermes Logger
// Centralized logging with levels and optional persistence

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  data?: unknown;
  timestamp: number;
  source: string;
}

const LOG_PREFIX = '[Hermes]';

class Logger {
  private entries: LogEntry[] = [];
  private maxEntries = 1000;
  private minLevel: LogLevel = 'info';

  private levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.minLevel];
  }

  private addEntry(level: LogLevel, message: string, data?: unknown, source = 'hermes'): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      message,
      data,
      timestamp: Date.now(),
      source,
    };

    this.entries.push(entry);

    // Trim if too many entries
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    // Console output
    const prefix = `${LOG_PREFIX}[${level.toUpperCase()}]`;
    switch (level) {
      case 'debug':
        console.debug(prefix, message, data || '');
        break;
      case 'info':
        console.info(prefix, message, data || '');
        break;
      case 'warn':
        console.warn(prefix, message, data || '');
        break;
      case 'error':
        console.error(prefix, message, data || '');
        break;
    }
  }

  debug(message: string, data?: unknown, source?: string): void {
    this.addEntry('debug', message, data, source);
  }

  info(message: string, data?: unknown, source?: string): void {
    this.addEntry('info', message, data, source);
  }

  warn(message: string, data?: unknown, source?: string): void {
    this.addEntry('warn', message, data, source);
  }

  error(message: string, data?: unknown, source?: string): void {
    this.addEntry('error', message, data, source);
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  clearEntries(): void {
    this.entries = [];
  }

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }
}

export const logger = new Logger();
