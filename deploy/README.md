# Deploy — https://erasmus.help.pontodigital.eu

Site estático (build do Vite) servido por um contentor Caddy pequeno no VPS, publicado pelo **proxy que o Coolify já tem** (Traefik ou Caddy). O proxy trata do certificado Let's Encrypt.

| | |
|---|---|
| VPS | Hostinger 1327038 · KVM 4 · Ubuntu 24.04 · `76.13.37.156` |
| SSH | `root@76.13.37.156` porta 22, autenticação por chave |
| DNS | `A erasmus.help → 76.13.37.156` (zona `pontodigital.eu`) |
| No servidor | `/opt/erasmus-help/releases/<id>` (últimas 5) · symlink `current` · contentor `erasmus-help-web` na rede `coolify` |

**Nunca:** instalar ou configurar outro Nginx; parar, substituir ou reconfigurar o proxy do Coolify; mexer nas portas 80/443, na firewall ou na autenticação SSH (a autenticação por password fica ativa); alterar outras apps do VPS (ex.: 76 Garage).

## Procedimento (a partir de qualquer máquina com a chave SSH autorizada)

```bash
# 1. Build de produção (a publishable key é pública por design; os dados estão protegidos por RLS)
npm ci
VITE_SUPABASE_URL=https://nankvmfyyncoopoxqibm.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=<valor em .github/workflows/deploy.yml, passo "Build"> \
npm run build
tar -czf release.tar.gz -C dist .

# 2. Envio
RELEASE="$(date -u +%Y%m%d%H%M%S)-$(git rev-parse --short HEAD)"
SSH="ssh -i <chave-privada> root@76.13.37.156"
$SSH "mkdir -p /opt/erasmus-help/incoming/$RELEASE"
scp -i <chave-privada> release.tar.gz deploy/Caddyfile deploy/remote-deploy.sh root@76.13.37.156:/opt/erasmus-help/incoming/$RELEASE/

# 3. Ativação (health check + rollback automático)
$SSH "DOMAIN=erasmus.help.pontodigital.eu APP_DIR=/opt/erasmus-help bash /opt/erasmus-help/incoming/$RELEASE/remote-deploy.sh $RELEASE /opt/erasmus-help/incoming/$RELEASE/release.tar.gz; rc=\$?; rm -rf /opt/erasmus-help/incoming/$RELEASE; exit \$rc"

# 4. Verificação (no 1.º deploy o certificado pode demorar ~1 min)
curl -sSI https://erasmus.help.pontodigital.eu/        # 200, certificado válido (sem -k)
curl -sSI https://erasmus.help.pontodigital.eu/chat    # 200 (rota da app)
curl -sSI http://erasmus.help.pontodigital.eu/         # 301 → https
```

O mesmo procedimento corre automaticamente em cada push para `main` (`.github/workflows/deploy.yml`) quando o repositório tem o secret `DEPLOY_SSH_KEY`; sem ele o workflow só faz lint, testes e build.

## O que `remote-deploy.sh` faz

1. Deteta o proxy do Coolify (`coolify-proxy`, Traefik ou Caddy) e a rede `coolify`; se faltarem, **para sem alterar nada**.
2. Recusa se o domínio já estiver nos labels de outro contentor (nunca rouba o domínio de outra app).
3. Valida o `Caddyfile` num contentor descartável; descarrega a imagem `caddy:2.8-alpine` só se não existir.
4. Descompacta a release em `releases/<id>` e troca o symlink `current` de forma atómica (a anterior fica guardada).
5. (Re)cria o contentor só quando a definição muda: só leitura, sem capabilities, 128 MB, labels do Traefik com prioridade explícita (ganha a rotas "catch-all" de outras apps, como a que hoje mostra o 76 Garage neste domínio) e redirecionamento HTTP → HTTPS.
6. Health check dentro do contentor e através do proxy; se falhar, **volta à release anterior** e apaga a que falhou.
7. Mantém as últimas 5 releases.

## Operação

```bash
docker logs --tail 50 erasmus-help-web                     # logs
readlink /opt/erasmus-help/current                         # release ativa
ls -1t /opt/erasmus-help/releases                          # releases guardadas
ln -sfn releases/<id-anterior> /opt/erasmus-help/current   # rollback manual (instantâneo, sem reiniciar)
```

## Problemas comuns

- **O domínio mostra outro site (ex.: 76 Garage) com "Inseguro"**: o contentor `erasmus-help-web` não está a correr ou o deploy não foi feito — corre o procedimento; o script cria a rota com certificado próprio.
- **Certificado inválido logo após o 1.º deploy**: o Let's Encrypt demora até ~1 min; confirma que o DNS aponta para `76.13.37.156` e que a porta 80 responde (desafio HTTP).
- **"is already routed to"**: o domínio está configurado noutra app/recurso do Coolify; remove-o dessa app no Coolify antes de repetir.
- **"Coolify proxy … not found / not running"**: o proxy do Coolify está parado — reinicia-o pelo Coolify (Servers → Proxy), não à mão.
