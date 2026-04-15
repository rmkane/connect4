import pino from 'pino'

const isProd = process.env.NODE_ENV === 'production'

/** Structured JSON in production; pretty-printed lines in development. */
export const logger: pino.Logger = pino(
  isProd
    ? { level: process.env.LOG_LEVEL ?? 'info' }
    : {
        level: process.env.LOG_LEVEL ?? 'debug',
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }
)
