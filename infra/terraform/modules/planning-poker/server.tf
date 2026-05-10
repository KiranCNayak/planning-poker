locals {
  resource_name = "planning-poker-${var.env}"
  fqdn          = "${var.subdomain}.${var.cloudflare_zone_name}"
}

resource "hcloud_ssh_key" "deploy" {
  name       = "${local.resource_name}-deploy"
  public_key = var.ssh_public_key
}

resource "hcloud_server" "this" {
  name         = local.resource_name
  server_type  = var.hetzner_server_type
  image        = var.hetzner_image
  location     = var.hetzner_location
  ssh_keys     = [hcloud_ssh_key.deploy.id]
  firewall_ids = [hcloud_firewall.this.id]

  public_net {
    ipv4_enabled = true
    ipv6_enabled = true
  }

  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", {
    deploy_user    = var.deploy_user
    ssh_public_key = var.ssh_public_key
  })

  labels = {
    project = "planning-poker"
    env     = var.env
  }
}
