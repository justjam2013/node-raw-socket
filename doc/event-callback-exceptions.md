# Native event callback exceptions

Investigated from merged `latest` commit
`9af4294e82a8f6471713df5fcc893649ed27669b` with NAN 2.28.0.

## Deterministic reproduction

The fixture in `test/native-event-exceptions.js` builds a separate addon from a
fresh temporary copy of `src/raw.cc` and `src/raw.h`. It replaces module
registration and skips `CreateSocket()` in the test constructor. The real
`IoEvent()` and `SocketWrap::HandleIOEvent()` bodies are unchanged. No raw socket,
network packet, or public production injection method is involved.

A synthetic watcher points to the native wrapper. The fixture invokes `IoEvent`
either directly from a JS-to-native call or from a one-shot libuv timer. The
latter reproduces the native event-loop entry boundary without depending on OS
poll readiness. It does not test the OS poll backend or raw-socket creation.
The wrapper uses the real `EventEmitter.prototype.emit` and distinctive listener
Errors. These tests exercise native wrapper dispatch, not public Socket
forwarding; the existing poll-error test covers that forwarding separately.

Before the production edit, a separate observational version of this fixture
recorded the following on macOS arm64:

| Case | Node 18.20.8 / 20.20.2 | Node 22.23.2 / 24.11.0 |
| --- | --- | --- |
| Combined readiness, no throw | `recvReady`, then `sendReady`, once each | Same |
| Combined readiness, receive throws, synchronous entry | `sendReady` listener entered despite pending exception; original Error reached JS catch | `sendReady` ran and the native call returned normally, losing the original Error |
| Combined readiness, receive throws, libuv entry | Exact Error reached `uncaughtException`; `sendReady` then ran | Same |
| Send-only listener throws | Exact Error reached JS catch or `uncaughtException`, depending on entry | Same |
| Poll-error listener throws | Listener first received one native Error with message `-22`; its own exact Error then propagated | Same |

The handled libuv cases returned to a working event loop without a fatal V8
error or a pending-exception diagnostic. Continuing to another listener after
an exception was nevertheless observable on every tested Node version. The
synchronous probe additionally exposed version-dependent exception loss.

## Change and invariant

Return immediately if the receive dispatch's `Nan::Call` result is empty.
[NAN documents](https://github.com/nodejs/nan/blob/main/doc/maybe_types.md#nanmaybelocal)
that an exception can produce an empty `MaybeLocal`. No catch, replacement Error,
second error event, or rethrow is necessary. The terminal send and poll-error
calls have no subsequent event to dispatch and remain unchanged.

After this change, all four tested versions propagate the exact receive Error
and omit `sendReady` for that callback. Send-only and poll-error exceptions retain
their previous semantics. Combined non-throwing readiness still emits both events
in order. Existing entry and post-receive closed checks remain unchanged.

## Verification

Run `npm run build` and `npm test`; the latter compiles the isolated fixture with
`node-gyp` (the same build tool already required by the package). No new dependency
or CI change is needed. Each child process has a timeout, and temporary build
files are removed afterward.

The regression includes synchronous and libuv cases for normal combined
readiness, receive/send/error listener throws, close during receive, and an
already closed wrapper. It checks Error identity, argument count, native Error
message, event counts/order, no duplicate close, and a subsequent native dispatch.
Three additional children omit `uncaughtException` handlers and must exit with
Node's normal uncaught-error status 1, without a fatal V8 diagnostic.

Locally, `npm run build` and `npm test` passed on Node 18.20.8, 20.20.2, 22.23.2,
and 24.11.0. Existing privilege-dependent raw-socket tests report skips where the
host disallows them; the new native exception tests require no privileges.
