type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private level: LogLevel = 'info';

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(msg: string, ...args: any[]): void {
    if (this.level === 'debug') {
      console.debug(`[DEBUG] ${msg}`, ...args);
    }
  }

  info(msg: string, ...args: any[]): void {
    console.info(`[INFO] ${msg}`, ...args);
  }

  warn(msg: string, ...args: any[]): void {
    console.warn(`[WARN] ${msg}`, ...args);
  }

  error(msg: string, ...args: any[]): void {
    console.error(`[ERROR] ${msg}`, ...args);
  }
}

export const logger = new Logger();
