variable "env" {
  type        = string
  description = "Environment slug used as a name suffix on resources (e.g., \"prod\", \"staging\")."
}

variable "subdomain" {
  type        = string
  description = "Subdomain within the Cloudflare zone (e.g., \"planning-poker\" for planning-poker.knayak.dev)."
}

variable "cloudflare_zone_name" {
  type        = string
  description = "Apex zone managed by Cloudflare (e.g., \"knayak.dev\")."
}

variable "hetzner_location" {
  type        = string
  description = "Hetzner datacenter location code. \"sin\" = Singapore, \"hel1\" = Helsinki, \"nbg1\" = Nuremberg, \"fbk1\" = Falkenstein, \"ash\" = Ashburn US."
  default     = "sin"
}

variable "hetzner_server_type" {
  type        = string
  description = "Hetzner server type. CPX21 = 3 vCPU / 4 GB / 80 GB."
  default     = "cpx21"
}

variable "hetzner_image" {
  type        = string
  description = "Base OS image for the VPS."
  default     = "debian-12"
}

variable "ssh_public_key" {
  type        = string
  description = "Full OpenSSH public key (e.g., contents of ~/.ssh/planning_poker_deploy.pub) granted access to the deploy user. Public keys are safe to commit."
}

variable "ssh_allowed_cidrs" {
  type        = list(string)
  description = "CIDR ranges allowed to SSH to the VPS. Default opens 22/tcp to the world; tighten to your IP for a real lockdown."
  default     = ["0.0.0.0/0", "::/0"]
}

variable "deploy_user" {
  type        = string
  description = "Unprivileged user the deploy workflow SSHes in as."
  default     = "deploy"
}
