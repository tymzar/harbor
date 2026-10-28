# Local model proxy

LiteLLM in front of the Meta Model API. Holds `META_API_KEY`; clients use `SMART_WEB_PROXY_KEY`. Both live in the git-ignored `../.env.local`.

```console
python3 -m venv .venv && .venv/bin/pip install -r proxy/requirements.txt
LITELLM=.venv/bin/litellm proxy/run.sh        # http://127.0.0.1:4000
```

| Proxy model | Upstream | Route |
|---|---|---|
| `spark` | `meta/muse-spark-1.3` | `/v1/chat/completions`, strict `json_schema` passes through |
| `sam` | `meta/sam-3.1` | `/v1/responses`, streaming; one noun phrase per request |

Verified 28 Oct: both models answer through the proxy; requests without a key or with a wrong key are refused (LiteLLM returns 500 / 400 rather than 401). `max_budget` is configured but not yet observed to stop a request.
