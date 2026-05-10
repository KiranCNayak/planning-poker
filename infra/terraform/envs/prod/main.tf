# Provider auth comes from environment variables — no secrets in this repo.
#   export HCLOUD_TOKEN=<from Hetzner project API tokens>
#   export CLOUDFLARE_API_TOKEN=<scoped Zone:DNS:Edit on knayak.dev>
provider "hcloud" {}

provider "cloudflare" {}

module "planning_poker" {
  source = "../../modules/planning-poker"

  env                  = "prod"
  subdomain            = var.subdomain
  cloudflare_zone_name = var.cloudflare_zone_name
  hetzner_location     = var.hetzner_location
  hetzner_server_type  = var.hetzner_server_type
  ssh_public_key       = var.ssh_public_key
  ssh_allowed_cidrs    = var.ssh_allowed_cidrs
}
