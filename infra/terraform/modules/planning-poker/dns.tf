data "cloudflare_zone" "this" {
  name = var.cloudflare_zone_name
}

# A record: planning-poker.knayak.dev -> VPS IPv4. Proxy off so Caddy on the
# VPS owns TLS and sees real client IPs.
resource "cloudflare_record" "ipv4" {
  zone_id = data.cloudflare_zone.this.id
  name    = var.subdomain
  content = hcloud_server.this.ipv4_address
  type    = "A"
  proxied = false
  ttl     = 1 # 1 = automatic
  comment = "managed by terraform (planning-poker ${var.env})"
}

resource "cloudflare_record" "ipv6" {
  zone_id = data.cloudflare_zone.this.id
  name    = var.subdomain
  content = hcloud_server.this.ipv6_address
  type    = "AAAA"
  proxied = false
  ttl     = 1
  comment = "managed by terraform (planning-poker ${var.env})"
}
