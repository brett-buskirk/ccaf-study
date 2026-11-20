resource "digitalocean_droplet" "api" {
  name   = "trailhead-api"
  region = "nyc3"
  size   = "s-1vcpu-1gb"
  image  = "ubuntu-24-04-x64"
}
