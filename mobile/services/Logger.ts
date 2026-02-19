/**
 * Logger Service
 * Centralized logging facade to support future integration with
 * telemetry services like Sentry, Datadog, or Firebase Crashlytics.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const Logger = {
  log: (message: string, ...args: any[]) => {
    Logger.print('info', message, ...args);
  },

  info: (message: string, ...args: any[]) => {
    Logger.print('info', message, ...args);
  },

  warn: (message: string, ...args: any[]) => {
    Logger.print('warn', message, ...args);
  },

  debug: (message: string, ...args: any[]) => {
    Logger.print('debug', message, ...args);
  },

  error: (message: string, error?: any, ...args: any[]) => {
    Logger.print('error', message, error, ...args);
    // TODO: Send to crash reporting service
    // e.g., Sentry.captureException(error);
  },

  print: (level: LogLevel, message: string, ...args: any[]) => {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]:`;
    
    switch (level) {
      case 'error':
        console.error(prefix, message, ...args);
        break;
      case 'warn':
        console.warn(prefix, message, ...args);
        break;
      case 'debug':
        console.debug(prefix, message, ...args);
        break;
      default:
        console.log(prefix, message, ...args);
    }
  }
};

export default Logger;
