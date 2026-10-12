const b64 = (s) => Buffer.from(s).toString('base64');

export function buildUserData({ cfg, entrypoint, idleStop }) {
  return `#!/bin/bash
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get -o DPkg::Lock::Timeout=600 update
apt-get -o DPkg::Lock::Timeout=600 install -y docker.io
systemctl enable --now docker

install -d /opt/rb
echo '${b64(entrypoint)}' | base64 -d > /opt/rb/entrypoint.sh
echo '${b64(idleStop)}' | base64 -d > /usr/local/bin/rb-idle-stop
chmod +x /opt/rb/entrypoint.sh /usr/local/bin/rb-idle-stop

cat > /etc/systemd/system/rb-idle-stop.service <<'EOF'
[Unit]
Description=remote-browser idle stop
[Service]
Type=oneshot
Environment=CDP_PORT=${cfg.cdpPort}
Environment=IDLE_MINUTES=${cfg.idleMinutes}
Environment=RB_STATE_DIR=/run/rb-idle
ExecStart=/usr/local/bin/rb-idle-stop
EOF

cat > /etc/systemd/system/rb-idle-stop.timer <<'EOF'
[Unit]
Description=remote-browser idle stop, every minute
[Timer]
OnBootSec=60
OnUnitActiveSec=60
[Install]
WantedBy=timers.target
EOF

# Drop dead client sessions quickly so a laptop network change does not leave stale -R listeners.
printf 'ClientAliveInterval 15\nClientAliveCountMax 3\n' > /etc/ssh/sshd_config.d/rb.conf
systemctl reload ssh

systemctl daemon-reload
systemctl enable --now rb-idle-stop.timer

docker pull ${cfg.image}
docker run -d --name rb-chrome --restart unless-stopped --network host --ipc=host --init -e CDP_PORT=${cfg.cdpPort} -v /opt/rb/entrypoint.sh:/entrypoint.sh:ro ${cfg.image} /entrypoint.sh
`;
}
