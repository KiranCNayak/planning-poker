# Encrypted secrets (SOPS + age)

Production runtime secrets for planning-poker live in `prod.enc.yaml`, encrypted with [SOPS](https://github.com/getsops/sops) using [age](https://github.com/FiloSottile/age) recipients. The encrypted file is checked into git; the age private key never is.

## How encryption works here

- `.sops.yaml` at the repo root maps `infra/secrets/*.enc.yaml` to the list of age public keys allowed to decrypt it.
- SOPS encrypts only the **values** in YAML; keys remain readable so diffs review well.
- The placeholder file currently committed encrypts to a single recipient — the project owner's age key. To add a teammate or a CI key: append their `age1...` public key to the list in `.sops.yaml`, then run `sops updatekeys infra/secrets/prod.enc.yaml`.

## Editing secrets locally

You need the age **private** key on disk. After `age-keygen -o ~/.config/sops/age/keys.txt`, point SOPS at it (macOS doesn't check `~/.config` by default):

```bash
export SOPS_AGE_KEY_FILE=~/.config/sops/age/keys.txt   # add to your ~/.zshrc
```

Then edit:

```bash
sops infra/secrets/prod.enc.yaml
```

This opens the file decrypted in `$EDITOR`. Save and quit — SOPS re-encrypts before writing. Commit the resulting `prod.enc.yaml` change like any other file. Only encrypted values change in the diff; SOPS metadata (mac, lastmodified) updates each save.

## What goes in here

The current schema (placeholder values to replace before first deploy):

| key | source |
| --- | --- |
| `DATABASE_URL` | Neon project → Connection string (pooled) |
| `REDIS_URL` | Upstash database → REST/TLS endpoint (`rediss://`) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ANON_SECRET` | `openssl rand -base64 32` (one per secret) |
| `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | `2d`, `30d` (defaults) |
| `FINGERPRINT_SALT` | `openssl rand -base64 24` |
| `INVITE_CODE` | The code you generated in Phase 0 |
| `CORS_ORIGIN`, `DOMAIN` | `https://planning-poker.knayak.dev`, `planning-poker.knayak.dev` |
| `IMAGE_TAG` | Set per-deploy by the release workflow; placeholder fine |
| `GH_OWNER` | `KiranCNayak` (used to build GHCR image refs) |
| `ROOM_CAPACITY_LIMIT` | `100` (default) |

## Decrypt at deploy time

The release workflow (PR 5) will run, on the VPS:

```bash
sops -d --output-type dotenv infra/secrets/prod.enc.yaml > infra/deploy/.env
docker compose -f infra/deploy/docker-compose.prod.yaml up -d
```

For that to work, the workflow needs the age **private** key as a GitHub Actions secret (`SOPS_AGE_KEY`, the literal `AGE-SECRET-KEY-…` value). SOPS reads it from the `SOPS_AGE_KEY` env var without any further config.
