declare module '@sentry/react-native' {
  export function init(options: {
    dsn: string;
    tracesSampleRate?: number;
    profilesSampleRate?: number;
    [key: string]: unknown;
  }): void;
  export function wrap<T>(component: T): T;
  export function captureException(error: unknown): string;
  export function captureMessage(message: string): string;
}
