# Chat actions: local implementation and server rollout

Status: source changes and isolated local PostgreSQL/RTC tests only. No production DDL, deployment or announcements were executed.

## Exact operator artifact

`server/chat-actions.sql` is the standalone, repeatable 0.21 upgrade for an existing deployment of `server/online.sql` and its prerequisites. It contains the reply reference columns, private reaction tables and the exact updated group/DM RPC definitions from canonical `server/online.sql`. Apply this transaction before enabling the new cloud UI. Review it against the target project before applying; do not run the rest of the application schema as a substitute.

Existing message bodies and message IDs are retained. New direct table access is revoked from public, anon and authenticated; metadata is returned only through the existing authorized RPC entry points. Replies resolve quoted text on the server and restrict targets to the same conversation or group history boundary. Attached reactions are explicit desired state (`enabled`), keyed by target + actor + shortcode, with safe repeat retries. Reaction mutations do not create messages or message Push.

The client enables Reply and attached reactions only after a read confirms `features.replies` and `features.reactions`. An older cloud backend keeps Copy and the existing standalone composer emoji. It must never receive a pretend reply whose target it silently ignores. RTC rooms use their host authority and do not require this SQL upgrade.

## Verification boundaries

Selected `cloud-account-rls` executes repeatable migrations and real PostgreSQL roles in an isolated local cluster. New assertions deny cross-conversation replies, unavailable group history targets, other-account mutations and direct reaction table access; they check nonce mismatch, server-derived previews and idempotent desired reaction state. The room conversation unit checks team visibility and projection boundaries. Browser WebRTC checks exercise the actual UI-to-host contract with an opposing team.

Production readiness still requires the explicitly authorized application of this artifact to the intended Supabase project, then verification with real signed-in accounts. That operation is outside this local delivery.
