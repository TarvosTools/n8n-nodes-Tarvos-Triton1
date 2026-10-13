# Contributing

Keep stable resource/operation names and output contracts backward compatible. Add meaningful request/response and failure tests when changing behavior. Use synthetic, unfunded transaction fixtures and sanitized RPC results.

Do not weaken wallet identity checks, signature verification, endpoint validation or ambiguity handling to make tests pass. Provider-dependent additions need linked primary documentation and observed endpoint evidence. Update the operation contract, examples and guides together.
