/**
 * User-facing brand strings, split by feature under ./brand/. Always import
 * from '@/lib/brand' (this barrel) so callers never care which file holds a
 * string. Static HTML sync notes live at the top of ./brand/core.ts.
 */
export * from './brand/core'
export * from './brand/auth'
export * from './brand/admin'
export * from './brand/kids'
export * from './brand/buckets'
export * from './brand/autoBucket'
export * from './brand/bank'
export * from './brand/history'
