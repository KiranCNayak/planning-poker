output "server_id" {
  description = "Hetzner server ID."
  value       = hcloud_server.this.id
}

output "server_ipv4" {
  description = "Public IPv4 address of the VPS."
  value       = hcloud_server.this.ipv4_address
}

output "server_ipv6" {
  description = "Public IPv6 address of the VPS."
  value       = hcloud_server.this.ipv6_address
}

output "fqdn" {
  description = "Fully qualified domain name pointed at the VPS."
  value       = local.fqdn
}

output "ssh_command" {
  description = "Convenience SSH command for connecting as the deploy user."
  value       = "ssh ${var.deploy_user}@${hcloud_server.this.ipv4_address}"
}
