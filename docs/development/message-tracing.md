# Message ancestry diagnostics

These diagnostics are opt-in and do not repair or modify conversation data.

Both switches default to `false`:

| Switch | Takes effect | Controls |
| --- | --- | --- |
| `MESSAGE_TRACE_ENABLED` | API startup, from the environment or `.env` | Server trace files, database monitoring and the browser upload endpoint |
| `VITE_MESSAGE_TRACE_ENABLED` | Frontend build | Browser collection, local session buffer and uploads |

Set `MESSAGE_TRACE_ENABLED=true` in the API environment to retain traces in dedicated rotating `message-trace-*.log` files. Build the frontend with `VITE_MESSAGE_TRACE_ENABLED=true`. For Docker builds, pass `--build-arg VITE_MESSAGE_TRACE_ENABLED=true`. Restart the API and reload the browser after enabling them. Setting the frontend variable only in the running container does not change an already built frontend.

For a source-based Compose deployment, run these commands in the deployment checkout containing this change. Its `api.build` must point at that checkout's Dockerfile (for example, in `docker-compose.override.yml`). Set `MESSAGE_TRACE_ENABLED=true` in the mounted `.env` first:

```sh
# Retain the currently running image before replacing the configured local image tag.
docker tag "$(docker inspect LibreChat --format '{{.Image}}')" librechat:before-message-ancestry
docker compose build --build-arg VITE_MESSAGE_TRACE_ENABLED=true api
docker compose up -d --no-deps --no-build api
curl --fail http://localhost:3080/health
```

Wait for any active generation to finish before restarting the API, then reload the browser. These commands rebuild the application and recreate only its container; they do not repair historical messages or recreate database services. To roll back the application image, retag the saved image using the API's configured image name and recreate the API:

```sh
ancestry_image=$(docker inspect LibreChat --format '{{.Config.Image}}')
docker tag librechat:before-message-ancestry "$ancestry_image"
docker compose up -d --no-deps --no-build api
```

Every record has the prefix `[message-trace]` and a single JSON payload, visible both in `docker logs LibreChat` and the mounted log directory. `requestId` links an HTTP request to MongoDB operations; `operationId` links a write attempt to its acknowledgement; `tabId` and `seq` order browser events. Browser-supplied records use `client.*` event names and include server receive time (`at`) and browser time (`clientAt`). They are diagnostic claims from the client, not authoritative database evidence.

| Events | Evidence |
| --- | --- |
| `http.start`, `http.end` | Request method, path without query parameters, browser tab, user, selected parent, status and disconnect/completion |
| `message.save` | Message/parent/conversation IDs, save call site and originating request |
| `db.write.start`, `db.write.end`, `db.write.failed` | Actual MongoDB inserts, updates, replacements, bulk writes and deletes for messages/conversations, structural fields and result counts |
| `db.delete.targets` | Message IDs and original parents selected for deletion by API model helpers, before deletion |
| `db.messages.read`, `history.*` | Stored graph, selected context chain, missing/cyclic parent and rejected requests |
| `context.*`, `generation.error` | Estimated context budget, retained/discarded message IDs, tool-output truncation, summary decisions, local input rejection and classified provider failures (including context limits) |
| `db.topology.*` | Startup baseline and changes observed by a read-only scan every 60 seconds, including changes by another process or TTL |
| `client.query.result`, `client.cache.*` | API result versus retained browser cache, graph changes and cross-conversation cache redirects |
| `client.branch.*`, `client.state.latest` | Visible branch, sibling index resets and cached latest-message changes |
| `client.view.*` | Rendered DOM message IDs versus visible IDs, scroll position/height after switching, and collapsed text state |
| `client.action.*`, `client.stream.*`, `stream.*` | Send/delete confirmation, selected parent, creation/finalization, cancellation, reconnection and disconnect |

Graph arrays are chunked; use `snapshotId`/`offset` for server snapshots and `tabId`/`seq`/`offset` for browser snapshots. `missingParentCount` on an operation-scoped subset is relative to that subset; use a complete `db.messages.read` or browser cache snapshot before diagnosing an orphan. Large `$in` filters are capped at 300 entries; deletion target snapshots retain all selected IDs in separate chunks.

No message body, file contents, authorization headers, cookies, passwords or API keys are intentionally collected by this tracing code. Structural identifiers, timestamps, counts and operation flags are retained. Existing legacy debug logs have their own content policy.

Browser records are batched to the authenticated `/api/diagnostics/messages` endpoint. Its independent rate limiter returns 429 without banning accounts. Uploads never refresh tokens; failures leave a bounded local buffer. The latest 300 events are also available in `sessionStorage['librechat.message-trace']`; after a reload the previous buffer is copied to `librechat.message-trace.previous`. In-flight/unflushed events can be absent from Docker logs if the page closes or the network is unavailable. The database sampler detects changes between scans, not operations that occur and reverse within the same minute; direct writes by another process have no originating HTTP request ID.

To export one conversation, replace `CONVERSATION_ID` with the ID in its `/c/` URL:

```sh
node config/collect-message-trace.js CONVERSATION_ID > /tmp/librechat-message-trace.jsonl
docker logs --since 30m LibreChat 2>&1 | rg '\[message-trace\]'
```

The collector reads plain and compressed trace files and includes related request boundaries and database acknowledgements. Set `LIBRECHAT_LOG_DIR` if the host log directory is different. The dedicated trace logger rotates at 20 MB and retains files for 14 days; Docker has its own rotation limits.

After reproduction, compare the last complete database graph, write/deletion records, server query response, browser cache and rendered branch in that order. Existing pre-instrumentation logs cannot reconstruct missing request IDs, message IDs or browser state retrospectively.

Disable with `MESSAGE_TRACE_ENABLED=false` and restart the API. Browser uploads stop after the endpoint returns 404, but local collection continues in an enabled frontend. To also stop local browser collection, rebuild with `VITE_MESSAGE_TRACE_ENABLED=false` (or the corresponding Docker build argument) and reload. Previously collected logs are retained.

The ancestry guard and selected-branch fix are independent of these diagnostic switches. They reject missing/cyclic history before agent generation and resolve the currently selected branch when sending a new message. Neither repairs existing orphans. Context trimming affects the model request; a `context.dropped` record alone is not evidence of database deletion. A historical deletion's original cause cannot be inferred from these safeguards.
