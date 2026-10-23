# API runtime lifecycle

The container runs Node directly as PID 1. On SIGTERM or SIGINT, it stops accepting connections and lets accepted HTTP requests finish for up to 100 seconds before forcing remaining sockets closed.

A Kubernetes deployment must withdraw the endpoint before termination (for example, a 10-second preStop delay) and allow at least 120 seconds of termination grace. Those settings leave time for endpoint propagation, the application drain, and process cleanup.

When migrating an image without this shutdown handler, qualify the new image in a non-serving pool, switch traffic only after it is ready, and keep the withdrawn old pool alive for the accepted-request drain interval before terminating it. The new handler cannot protect requests already running in an old image.

`npm run build && npm test` verifies that an accepted response completes during shutdown and that a stalled request reaches the bounded cutoff. These tests do not call a payment provider or send transactions.
