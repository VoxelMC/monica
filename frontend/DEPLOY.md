# Deploying orbit (read-only)

Run these as **`ubc`** on the server. orbit-dev can't use Docker, so these steps are yours. Everything here
adds one container next to Monica; Monica, its data and DAVx⁵ are not changed.
Background: SPEC.md, "Deployment".

## First time

```bash
# 1. Fresh backup (orbit's first read gives a few Monica records an internal uuid; see SPEC.md, "Found on staging")
~/backups/monica/backup.sh

# 2. Get the code (deploy clone, separate from orbit-dev's working copy)
git clone -b orbit https://github.com/VoxelMC/monica.git ~/repos/orbit    # first time
# later: cd ~/repos/orbit && git pull

# 3. Secrets: a PRODUCTION token (Monica > Settings > API > Personal access tokens)
cd ~/repos/monica
install -m 600 /dev/null orbit.env
cat > orbit.env <<'ENV'
MONICA_TOKEN=paste-the-production-token-here
ORBIT_READ_ONLY=true
ORBIT_DRY_RUN=false
MONICA_PUBLIC_URL=https://monica.trevfox.dev
ENV
vim orbit.env     # paste the real token

# 4. Data folder for orbit's own database (the container runs as uid 1000)
mkdir -p orbit-data && sudo chown 1000:1000 orbit-data
```

5. Add the `orbit` service to `~/repos/monica/compose.yaml` (Monica's own services stay as they are):

```yaml
  orbit:
    build: ../orbit/frontend
    network_mode: service:tailscale
    depends_on: [tailscale, app]
    env_file: ./orbit.env
    environment:
      HOST: 127.0.0.1
      PORT: "3000"
      ORIGIN: https://orbit.trevfox.dev
      MONICA_URL: http://127.0.0.1:80
      ORBIT_DB_PATH: /data/orbit.sqlite
    volumes:
      - ./orbit-data:/data
    restart: unless-stopped
```

6. Caddyfile: move the existing `tls { dns porkbun … }` block into a `(porkbun)` snippet, use
   `import porkbun` in the `monica.trevfox.dev` site, and add:

```text
orbit.trevfox.dev {
	import porkbun
	reverse_proxy 127.0.0.1:3000
}
```

7. Porkbun DNS: `A` record `orbit` → `100.69.133.121`.

```bash
# 8. Build and start orbit only, then restart Caddy
cd ~/repos/monica
docker compose up -d --build orbit
# The Caddyfile is bind-mounted as a single file; editors like vim save a new file,
# so the container keeps the old one until Caddy restarts (Monica blips for seconds).
docker compose restart caddy
docker compose exec caddy grep -c orbit /etc/caddy/Caddyfile   # must be 1, not 0

# 9. Check: should print 200
docker compose exec orbit node -e "fetch('http://127.0.0.1:3000/health').then(r=>console.log(r.status))"
docker compose logs --tail 20 orbit
```

10. On your phone (Tailscale on): open https://orbit.trevfox.dev/health. It should say "Connected" and
    "Read-only: on (writes refused)". Then add it to your home screen.

## Updating

```bash
patch-orbit            # backup, pull, rebuild orbit, health check
patch-orbit --check    # health check only
```

Install once (a copy, so it only changes when you re-install it):

```bash
mkdir -p ~/.local/bin && install -m 755 ~/repos/orbit/frontend/scripts/patch-orbit ~/.local/bin/patch-orbit
```

By hand, it does:

```bash
~/backups/monica/backup.sh
cd ~/repos/orbit && git pull
cd ~/repos/monica && docker compose up -d --build orbit
```

## Rollback

```bash
cd ~/repos/monica && docker compose rm -sf orbit
```

Monica and DAVx⁵ keep working; nothing in Monica depends on orbit.

## Keep in mind

- Keep `ORBIT_READ_ONLY=true` until slice 4 is approved. With it on, orbit refuses every write before
  anything reaches Monica.
- Check that the next night's backup includes `orbit-data`.
