export function startServer(dir: string, port?: number, host?: string): Promise<{ server: unknown; port: number; close(): Promise<void> }>;
