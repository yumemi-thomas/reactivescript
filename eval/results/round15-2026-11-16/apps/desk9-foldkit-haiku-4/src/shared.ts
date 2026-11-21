import { Effect, Schema } from 'effect'

export const Hit = Schema.Struct({ id: Schema.Number, name: Schema.String })
export type Hit = typeof Hit.Type

export const callApi = <A>(call: () => Promise<A>) =>
  Effect.tryPromise({
    try: call,
    catch: error => (error instanceof Error ? error.message : String(error)),
  })
