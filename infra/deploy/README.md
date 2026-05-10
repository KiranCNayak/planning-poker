# Production deploy bundle

The compose file, Caddyfile, and example `.env` in this directory are what runs on the VPS. They are pushed there by the `release.yaml` GitHub Action, not by hand, but the artifacts also work for an emergency manual deploy.

## First deploy (Phase 5)

Order matters. Skip a step and the next will fail.

### 1. Apply the Terraform module

```bash
cd infra/terraform/envs/prod
cp terraform.tfvars.example terraform.tfvars
# paste your ed25519 public key into terraform.tfvars

export HCLOUD_TOKEN="hcl_..."
export CLOUDFLARE_API_TOKEN="..."
terraform init
terraform plan
terraform apply
```

Outputs include `server_ipv4`, `fqdn`, and a ready-to-paste `ssh_command`. Wait ~60s for cloud-init to finish, then verify:

```bash
ssh deploy@$(terraform output -raw server_ipv4) 'docker --version && docker compose version'
```

### 2. Fill in real production secrets

```bash
export SOPS_AGE_KEY_FILE=~/.config/sops/age/keys.txt
sops infra/secrets/prod.enc.yaml
```

Replace every `REPLACE_ME_*` value with the real Neon URL, Upstash URL, JWT secrets, invite code, etc. Save and quit. SOPS re-encrypts on save.

```bash
git add infra/secrets/prod.enc.yaml
git commit -m "chore(secrets): populate production secrets"
git push
```

The diff should show only encrypted-value changes; no plaintext.

### 3. Configure GitHub Actions

In the GitHub repo settings:

**Repository secrets** (Settings → Secrets and variables → Actions → Secrets):

- `DEPLOY_SSH_KEY` — contents of `~/.ssh/planning_poker_deploy` (the **private** key, including the `-----BEGIN OPENSSH PRIVATE KEY-----` header).
- `SOPS_AGE_KEY` — the `AGE-SECRET-KEY-…` line from `~/.config/sops/age/keys.txt` (just the key, no comment lines).

**Environment** (Settings → Environments → New environment → `prod`):

- Variable: `DEPLOY_HOST` = `planning-poker.knayak.dev`

(Optionally enable required reviewers on the `prod` environment if you want manual approval before each deploy.)

### 4. Cut the first release

The cleanest way is to merge a `feat:` or `fix:` commit to `main`, wait for `release-please.yaml` to open a release PR, and merge it. The merge creates the first tag (`v0.1.1` or similar) and triggers `release.yaml`.

To bypass and tag directly:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Either path triggers `release.yaml`, which builds both images, pushes to GHCR, and runs the deploy job. Watch the Actions tab; the deploy job logs will show `docker compose pull` followed by `up -d`.

### 5. Smoke-test

Open `https://planning-poker.knayak.dev`. Register with the invite code from your secrets file. Create a room, vote, reveal.

## Day-2 operations

### Tail logs

```bash
ssh deploy@planning-poker.knayak.dev 'cd /opt/planning-poker && docker compose logs -f backend'
```

Replace `backend` with `frontend`, `caddy`, or omit for all.

### Roll back to a previous tag

If `release.yaml` succeeded with a bad image, the fastest rollback is to re-run `release.yaml` on a previous tag from the Actions UI ("Re-run jobs" against the older workflow run). That re-pushes the older `IMAGE_TAG` to the VPS and `compose up -d` swaps containers.

If you need to rollback by hand (e.g., the deploy job failed mid-flight):

```bash
ssh deploy@planning-poker.knayak.dev
cd /opt/planning-poker
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=v0.1.0/' .env   # the last good tag
echo $GHCR_PAT | docker login ghcr.io -u <github-user> --password-stdin
docker compose -f docker-compose.prod.yaml pull
docker compose -f docker-compose.prod.yaml up -d
docker logout ghcr.io
```

(Manual pulls require a long-lived GHCR PAT or making the GHCR packages public. Set this up only if you actually need manual rollbacks.)

### Run an ad-hoc migration

The compose file already runs `prisma migrate deploy` as a one-shot before backend starts on each `up -d`. To force a re-run without redeploying the app:

```bash
ssh deploy@planning-poker.knayak.dev
cd /opt/planning-poker
docker compose -f docker-compose.prod.yaml run --rm migrator
```

### Add a new environment variable

1. `sops infra/secrets/prod.enc.yaml`, add the key, save.
2. Commit and push.
3. Add the variable to the backend Zod schema (`backend/src/config/env.ts`) so it's required and typed.
4. Cut a release; the deploy workflow scps the new `.env` and restarts the stack.
