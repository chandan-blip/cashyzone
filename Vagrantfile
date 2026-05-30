# -*- mode: ruby -*-
# vi: set ft=ruby :

Vagrant.configure("2") do |config|
  config.vm.box = "ubuntu/jammy64"
  config.vm.hostname = "cashyzone"

  # Forward the Express port to the host.
  config.vm.network "forwarded_port", guest: 3000, host: 3000, host_ip: "127.0.0.1"

  # Project root is synced to /vagrant by default; the app lives in /vagrant/app.

  config.vm.provider "virtualbox" do |vb|
    vb.name = "cashyzone"
    vb.memory = 1024
    vb.cpus = 2
  end

  config.vm.provision "shell", path: "scripts/provision.sh"
end
