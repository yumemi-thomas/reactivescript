import { Effect, Schema } from 'effect'

const UNEXPECTED_RESPONSE = 'unexpected response from the server'

const errorMessage = (error: unknown): string =>
  error instanceof Error && error.message !== ''
    ? error.message
    : String(error)

/** Runs one backend call, failing with the server's error message. */
export const callApi = <A>(call: () => Promise<A>): Effect.Effect<A, string> =>
  Effect.tryPromise({ try: call, catch: errorMessage })

/** Runs one backend call and checks its answer against `schema`. */
export const callApiDecoded = <S extends Schema.Top>(
  schema: S,
  call: () => Promise<unknown>,
): Effect.Effect<S['Type'], string, S['DecodingServices']> =>
  callApi(call).pipe(
    Effect.flatMap(response =>
      Schema.decodeUnknownEffect(schema)(response).pipe(
        Effect.mapError(() => UNEXPECTED_RESPONSE),
      ),
    ),
  )
