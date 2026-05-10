# Terraform — planning-poker infrastructure

Provisions the production VPS (Hetzner Cloud, Singapore) and the Cloudflare DNS records that point `planning-poker.knayak.dev` at it. The compose stack and app images themselves are deployed separately by GitHub Actions in a later PR.

## Layout

```
modules/planning-poker/      Reusable module (one VPS + firewall + DNS records + cloud-init)
envs/
  prod/                      Production environment — single instance of the module
```

To add a new environment: `cp -r envs/prod envs/staging`, edit two values in `terraform.tfvars` (subdomain, maybe location), and `terraform apply` from the new directory.

## Prerequisites (Phase 0)

Before the first `apply`:

1. **Hetzner Cloud**: create a project, generate an API token (Read/Write).
2. **Cloudflare**: generate an API token scoped `Zone:DNS:Edit` on `knayak.dev`.
3. **SSH keypair** for the deploy user:
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/planning_poker_deploy -C "planning-poker-deploy"
   ```
4. **Terraform** ≥ 1.6 installed locally.

## Configure

```bash
cd infra/terraform/envs/prod
cp terraform.tfvars.example terraform.tfvars
# paste your public key into terraform.tfvars
```

Export provider credentials in your shell (don't commit them):

```bash
export HCLOUD_TOKEN="hcl_..."
export CLOUDFLARE_API_TOKEN="..."
```

## Apply

```bash
terraform init
terraform plan      # review the plan: 1 server, 1 ssh key, 1 firewall, 2 DNS records
terraform apply
```

Outputs include the VPS IPv4/IPv6 and a ready-to-paste `ssh_command`. After ~30 seconds, cloud-init finishes installing Docker and the deploy user — verify with:

```bash
ssh deploy@<server_ipv4> 'docker --version && docker compose version'
```

## State

State currently lives locally as `envs/prod/terraform.tfstate` (gitignored). For multi-machine work or solo durability, migrate to **Terraform Cloud**:

1. Sign up at app.terraform.io, create an org and a workspace named `planning-poker-prod`.
2. Uncomment the `cloud { ... }` block in `envs/prod/versions.tf`.
3. `terraform login`, then `terraform init -migrate-state`.
4. Add `HCLOUD_TOKEN` and `CLOUDFLARE_API_TOKEN` as **environment variables** (sensitive) on the workspace.

## Tearing it down

```bash
cd infra/terraform/envs/prod
terraform destroy
```

This deletes the VPS, the firewall, the SSH key registration, and the DNS records. The Hetzner project and Cloudflare zone themselves are untouched.
