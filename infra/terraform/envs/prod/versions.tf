terraform {
  required_version = ">= 1.6.0"

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.50"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.50"
    }
  }

  # State currently lives locally in this directory (terraform.tfstate, gitignored).
  # Migrate to Terraform Cloud once the workspace is provisioned by uncommenting:
  #
  # cloud {
  #   organization = "<your-tfcloud-org>"
  #   workspaces { name = "planning-poker-prod" }
  # }
  #
  # then run `terraform init -migrate-state`.
}
