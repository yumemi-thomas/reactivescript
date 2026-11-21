import { Effect, Schema } from 'effect'

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

// NOTE: every backend answer is decoded against its schema, so a malformed
// response becomes an ordinary failure Message instead of corrupting the Model.
export const request = <A, I>(
  schema: Schema.Codec<A, I>,
  call: () => Promise<unknown>,
): Effect.Effect<A, unknown> =>
  Effect.tryPromise({ try: call, catch: error => error }).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(schema)),
  )
