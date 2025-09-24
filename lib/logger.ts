type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40,
};

const envLevel = (process.env.LOG_LEVEL || 'debug').toLowerCase() as LogLevel;
const threshold = LOG_LEVELS[envLevel] ?? LOG_LEVELS.debug;

function formatMessage(level: LogLevel, message: string): string {
	const ts = new Date().toISOString();
	return `[${ts}] [${level.toUpperCase()}] ${message}`;
}

function safeSerialize(obj: unknown): unknown {
	try { return typeof obj === 'object' ? JSON.parse(JSON.stringify(obj)) : obj; } catch { return obj; }
}

function log(level: LogLevel, message: string, meta?: unknown) {
	if ((LOG_LEVELS[level] ?? 0) < threshold) return;
	const formatted = formatMessage(level, message);
	if (meta !== undefined) {
		console[level](formatted, safeSerialize(meta));
	} else {
		console[level](formatted);
	}
}

export const logger = {
	debug: (msg: string, meta?: unknown) => log('debug', msg, meta),
	info: (msg: string, meta?: unknown) => log('info', msg, meta),
	warn: (msg: string, meta?: unknown) => log('warn', msg, meta),
	error: (msg: string, meta?: unknown) => log('error', msg, meta),
};

export default logger;


