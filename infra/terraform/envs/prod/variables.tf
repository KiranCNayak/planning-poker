variable "subdomain" {
  type    = string
  default = "planning-poker"
}

variable "cloudflare_zone_name" {
  type    = string
  default = "knayak.dev"
}

variable "hetzner_location" {
  type    = string
  default = "sin"
}

variable "hetzner_server_type" {
  type    = string
  default = "cpx21"
}

variable "ssh_public_key" {
  type        = string
  description = "Paste the contents of ~/.ssh/planning_poker_deploy.pub in terraform.tfvars."
}

variable "ssh_allowed_cidrs" {
  type    = list(string)
  default = ["0.0.0.0/0", "::/0"]
}
