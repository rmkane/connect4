import { createConsola } from 'consola'

/** Browser-friendly logger (levels, tags); quieter in production builds. */
export const logger = createConsola({
  defaults: { tag: 'gameroom-client' },
  level: import.meta.env.DEV ? 4 : 3,
})
