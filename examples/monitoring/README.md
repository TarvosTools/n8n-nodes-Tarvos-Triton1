# Devnet monitoring acceptance workflows

- `devnet-live-account.json`: listens for a single manual batch of clock-account updates. Choose your Devnet Triton RPC credential. No wallet secret or transfer is needed.
- `devnet-worker.json`: checks worker status, reads the configured Devnet wallet, consumes five test events and acknowledges them. This is an acceptance workflow; it intentionally acknowledges test events without external business processing. Use a dedicated test consumer, not a production consumer.

Import these workflows into your own n8n instance and map your own credentials. The worker example uses consumer `n8n-monitor`; configure that consumer in the worker or change the workflow to your dedicated test consumer.

Build the parent package, configure the worker as described in [worker setup](../../worker/README.md), then start it:

```sh
cd worker
npm ci --ignore-scripts
npm start
```

Keep that process running while executing the workflow, then stop it with Ctrl+C after a bounded test. The default local binding is `127.0.0.1:5690`. Configure source token environment variables, a worker token and persistent storage before starting. These are acceptance templates, not a continuously managed deployment.

The dedicated Account Sync stream returns HTTP 501 on the current endpoint. Reads succeed through an exact-value RPC fallback, reported explicitly in the output. Whirligig and ordinary Dragon's Mouth streams do work. A fallback read is not proof of a cache hit or push delivery.
