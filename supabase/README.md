# Supabase — Chat interno (Erasmus Help)

Chat entre pessoas (conversas individuais e grupos): texto e áudio, histórico, estado de leitura, não lidas, Realtime, fotos de perfil e de grupo.
Projeto: `https://nankvmfyyncoopoxqibm.supabase.co` (ref `nankvmfyyncoopoxqibm`).

| Ficheiro | Conteúdo |
|---|---|
| `migrations/20260926090000_chat_core.sql` | enums, tabelas, índices, triggers (updated_at, guarda do perfil, contabilidade das mensagens) |
| `migrations/20260926090100_chat_security.sql` | RLS em todas as tabelas, helpers `private.*`, policies, privilégios |
| `migrations/20260926090200_chat_rpc.sql` | RPCs (perfil, associação, grupos, leitura, admin) |
| `migrations/20260926090300_chat_storage_realtime.sql` | bucket privado `chat-audio` + policies, publicação Realtime |
| `migrations/20260926100000_chat_directory.sql` | IDs sequenciais sem buracos, diretório (pesquisa por ID/nome), conversas diretas com qualquer pessoa, administradores de grupo, fotos (bucket `avatars`) |
| `apply_all.sql` | as 5 migrações pela ordem, numa única transação (gerado por `node supabase/build-apply-all.mjs`) |
| `config.toml` | stack local (`npx supabase start`): login anónimo ligado |
| `tests/chat_rls.test.sql` | testes pgTAP do chat (87 asserções) |
| `tests/chat_directory.test.sql` | testes pgTAP da migração 5: IDs, diretório, grupos, fotos, privilégios (247 asserções) |
| `scripts/` | testes contra a stack local em execução: concorrência dos IDs e segurança pela API HTTP (ver §6) |

## 1. Aplicar

### Opção A — SQL Editor (sem CLI)
1. Dashboard → **SQL Editor** → New query.
2. Colar **todo** o `apply_all.sql` → **Run** (uma vez). Corre como `postgres` numa transação: ou aplica tudo, ou nada.
3. Deve terminar com `Erasmus Help chat schema applied`.

Funciona num projeto novo **e** num projeto onde já correu um `apply_all.sql` anterior: todas as migrações são idempotentes (a migração 3 apaga e recria as 3 funções cujo resultado mudou na 5). Contas e mensagens existentes são mantidas; o contador de IDs continua a partir do maior número já atribuído.

### Opção B — CLI
```bash
npx supabase login
npx supabase link --project-ref nankvmfyyncoopoxqibm
npx supabase db push
```
Se o projeto já recebeu o `apply_all.sql`, marcar antes as migrações como aplicadas:
`npx supabase migration repair --status applied 20260926090000 20260926090100 20260926090200 20260926090300 20260926100000`.

### Verificação rápida (SQL Editor)
```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;             -- 5 tabelas, rowsecurity = true
select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public';
select id, public, file_size_limit from storage.buckets where id in ('chat-audio', 'avatars');    -- chat-audio privado, avatars público
select * from private.public_id_counter;                                                         -- último ID atribuído
```

## 2. Definições obrigatórias no Dashboard

1. **Authentication → Sign In / Providers → Allow anonymous sign-ins: ON**. A app faz `signInAnonymously()` por dispositivo depois do onboarding (é a "criação de conta").
2. **Authentication → Attack Protection → CAPTCHA (Cloudflare Turnstile): fortemente recomendado.** Sem isto, qualquer script cria contas anónimas à vontade — e com o diretório aberto cada conta vê nomes, tipos e fotos. **Atenção: o frontend AINDA NÃO envia `options.captchaToken`** — ativar o CAPTCHA antes dessa integração parte o Chat (erro `captcha_required`). Até lá, baixar o rate limit.
3. **Authentication → Rate Limits**: baixar "anonymous sign-ins" por IP/hora (ex.: 10–30).
4. **Data API → Exposed schemas**: manter só `public` (+ `graphql_public`). **Nunca** expor `private`.
5. Nada a fazer em Realtime/Storage: as migrações criam os buckets `chat-audio` e `avatars` e adicionam as tabelas à publicação `supabase_realtime`.
6. Frontend: `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` (pública; a proteção é o RLS). A service role / `sb_secret_` key **nunca** vai para o frontend.

## 3. Modelo

- **Conta**: 1 utilizador anónimo por dispositivo + perfil (`upsert_my_profile`) com nome, tipo (`student` | `monitor`), idiomas e localização.
- **ID público** (`profiles.public_id`): atribuído pela base de dados (trigger `profiles_public_id` + contador `private.public_id_counter` com lock de linha) → sequencial **sem buracos** (um registo que falha ou faz rollback devolve o número), único, **nunca reutilizado** (apagar uma conta não liberta o número), **nunca editável** (trigger `profiles_public_id_immutable`, em qualquer contexto, incluindo SQL Editor e service_role). Registos simultâneos esperam uns pelos outros. A app mostra `ID: 01`…`ID: 09`, depois `ID: 10`, `ID: 100`.
- **Diretório**: qualquer conta com perfil encontra pessoas por ID (ID exato primeiro, depois os IDs que começam por esses dígitos) ou por nome (sem distinguir acentos/maiúsculas) com `search_profiles`, e abre uma conversa direta com `start_direct_conversation(public_id)` (uma por par, idempotente). Só se expõe `id, public_id, display_name, role, avatar_path`; nunca o próprio; admins da plataforma não aparecem a não-admins.
- **Grupos**: qualquer conta cria (`create_group`) e fica **administrador** (`member_role = 'manager'`). Administradores adicionam/removem membros (incluindo outros administradores), mudam o nome e a foto, promovem/despromovem (`set_group_member_role`), arquivam. Um grupo nunca fica sem administrador (trigger `conversation_members_after_delete`: se o último sai, é removido ou a conta é apagada, o membro mais antigo passa a administrador; um grupo vazio é apagado). Grupos de onde não se pode sair (`allow_leave = false`) só podem ser criados por admins da plataforma.
- **Papéis da plataforma**: `student` | `monitor` (começa `pending`; a verificação só conta para a associação aluno↔monitor feita pelos admins) | `admin` (só por SQL, §4; vê e gere tudo, apaga grupos). `profiles.can_manage_groups` já não é usado (legado).
- **Fotos**: bucket **público** `avatars` (objetos `users/{uid}/{uuid}.jpg` e `groups/{conversa}/{uuid}.jpg`, nomes aleatórios, sem listagem). A app recorta e reduz para JPEG de 512 px no browser (sem EXIF). Upload só na própria pasta / em grupos que administra, no máximo 30 por dia; `set_my_avatar` / `set_group_avatar` verificam que o objeto existe e é do autor. Só se apagam fotos com mais de 24 h.

## 4. Promover um admin

Só o dono do projeto, no SQL Editor. Um admin nunca se auto-atribui nem promove outros admins.
```sql
select id, public_id, display_name, role from public.profiles where public_id = 7;   -- a app mostra "ID: 07"
update public.profiles set role = 'admin' where public_id = 7;
-- despromover: update public.profiles set role = 'student' where public_id = 7;   ('monitor' → volta a 'pending')
```

## 5. Modelo de segurança (resumo)

- **RLS em todas as tabelas, negar por omissão**, policies só `to authenticated` (utilizadores anónimos da Supabase são `authenticated`; `anon` = sem sessão → nada).
- **Escritas** em `profiles`, `monitor_students`, `conversations`, `conversation_members`: só via RPCs `security definer` que verificam permissões (membro / administrador do grupo / admin). Clientes só inserem `messages` diretamente (RLS: remetente = eu, sou membro, conversa não arquivada; áudio só se o objeto existir no Storage e for meu).
- Quem não é membro não lê a conversa, os membros nem as mensagens (nem por Realtime) e não pode escrever — confirmado pelos testes pgTAP e pelo `scripts/api_security_check.mjs`.
- **`profiles`**: outros utilizadores só veem `id, public_id, display_name, role, monitor_status, my_language, avatar_path, created_at` (privilégios por coluna). `select('*')` falha (42501) — selecionar colunas explícitas.
- Erros das RPCs: `P0001` + mensagem `not_authenticated | not_allowed | not_found | invalid_input | already_associated | already_member | not_verified | archived | last_manager` (ver `parseChatRpcError` em `src/services/chat/types.ts`).

## 6. Testes

Stack local (Docker): `npx supabase start` (aplica `migrations/`).
```bash
npx supabase test db                                 # pgTAP: 334 asserções, numa transação com rollback
supabase/scripts/test_public_id_concurrency.sh 40   # N registos em paralelo (+ variante com ROLLBACK + "dois separadores"): IDs únicos e sem buracos
node supabase/scripts/api_security_check.mjs        # 3 contas via supabase-js: um estranho não lê/escreve nada da conversa A–B
npm run test:e2e                                     # Playwright (raiz do repo): fluxo completo com 4 contas, mobile + desktop
```
- `chat_directory.test.sql` começa com `profiles` vazia e o contador a 0 **dentro da transação** (IDs determinísticos 1..101); enquanto corre, registos reais na mesma base esperam pelo lock do contador. Os comentários `BUG-n` marcam regressões de bugs encontrados e corrigidos.
- O script de concorrência usa `psql` (`DB_URL`, por omissão a base local) e no fim repõe o contador se ninguém mais se registou (`KEEP_COUNTER=1` para não repor). O da API lê `API_URL`/`PUBLISHABLE_KEY`/`SECRET_KEY` do ambiente ou de `supabase status -o env`.
- `config.toml` sobe o limite local de logins anónimos (a suite E2E cria muitas contas); em produção o limite define-se no Dashboard.

## 7. Tipos TypeScript

`src/services/supabase/database.types.ts` é gerado a partir da base local com todas as migrações:
```bash
npx supabase gen types typescript --local --schema public > src/services/supabase/database.types.ts
# ou, com o projeto ligado: --project-id nankvmfyyncoopoxqibm
```
Os tipos de domínio (camelCase) estão em `src/services/chat/types.ts`.

## 8. Privacidade (incluir no aviso de privacidade da app)

- **Diretório aberto**: qualquer pessoa com conta no chat pode encontrar outra pelo ID ou nome e ver nome, tipo (Aluno/Monitor), ID e foto. Cidade, país e idiomas da app não são expostos.
- **Fotos** ficam num bucket público com nomes aleatórios: quem tiver o URL consegue vê-las.
- **Os administradores da plataforma podem ler todas as conversas, participantes e mensagens (incluindo áudio) para moderação.**
- Áudio guardado num bucket **privado**; só membros da conversa (e admins) o podem ler, através de URLs assinados temporários.
- Apagar um utilizador em `auth.users` apaga o perfil, as associações, as mensagens que enviou e as conversas diretas em que participa (cascata); nos grupos passa a administração a outro membro. Os ficheiros de áudio e fotos **não** são apagados automaticamente.
- **Retenção ainda não implementada**: não há expiração de mensagens nem limpeza de áudios/fotos órfãos (fazer com Edge Function/cron + Storage API).
- Identidade anónima por dispositivo: se o utilizador apagar os dados do browser, perde a sessão e passa a ter um novo ID (o antigo fica órfão). Considerar mais tarde "linking" da conta anónima a email/OAuth.

## 9. Limitações conhecidas

- **Enumeração**: com contas anónimas e o diretório aberto, um script pode percorrer os IDs e listar nomes/fotos. Mitigação: CAPTCHA + rate limits (§2); evolução: limite de pesquisas por conta, bloquear/denunciar.
- Qualquer pessoa pode abrir uma conversa com qualquer outra e adicioná-la a grupos (de onde pode sair). Não há ainda bloquear/denunciar.
- Uma conversa direta arquivada pelos admins (associação aluno↔monitor removida) pode ser reaberta por "Adicionar pessoa".
- A pesquisa por nome percorre a tabela (`unaccent` por perfil): suficiente para milhares de contas; para mais, índice trigram sobre um nome normalizado.
- **Realtime DELETE**: eventos DELETE não passam por RLS e chegam (só com a chave primária — UUIDs) a quem subscrever a tabela. Sem conteúdo, mas é metadado. Evolução: Realtime Broadcast com canais privados.
- Notificações com a app fechada (Web Push) precisam de um backend que ainda não existe (`src/services/notifications/push.ts`); com a app aberta em segundo plano há notificações do browser.
- Sem rate limit por utilizador no envio de mensagens (só os limites gerais da API).
- Novos membros de um grupo veem o histórico anterior à sua entrada.
