# Supabase — Chat interno (Erasmus Help)

Chat entre pessoas (alunos ↔ monitores, grupos): texto e áudio, histórico, estado de leitura, não lidas, Realtime.
Projeto: `https://nankvmfyyncoopoxqibm.supabase.co` (ref `nankvmfyyncoopoxqibm`).

| Ficheiro | Conteúdo |
|---|---|
| `migrations/20260926090000_chat_core.sql` | enums, tabelas, índices, triggers (updated_at, guarda do perfil, contabilidade das mensagens) |
| `migrations/20260926090100_chat_security.sql` | RLS em todas as tabelas, helpers `private.*`, policies, privilégios |
| `migrations/20260926090200_chat_rpc.sql` | RPCs (perfil, associação, grupos, leitura, admin) |
| `migrations/20260926090300_chat_storage_realtime.sql` | bucket privado `chat-audio` + policies, publicação Realtime |
| `apply_all.sql` | as 4 migrações pela ordem, numa única transação (gerado) |
| `tests/chat_rls.test.sql` | testes pgTAP do chat (87 asserções) |
| `tests/chat_directory.test.sql` | testes pgTAP da migração 5: IDs, diretório, grupos, avatares (244 asserções) |
| `scripts/` | testes contra a stack local em execução: concorrência dos IDs, API HTTP (ver §6) |

## 1. Aplicar

### Opção A — SQL Editor (projeto novo, sem CLI)
1. Dashboard → **SQL Editor** → New query.
2. Colar **todo** o `apply_all.sql` → **Run** (uma vez). Corre como `postgres` numa transação: ou aplica tudo, ou nada.
3. Deve terminar com `Erasmus Help chat schema applied`.

Alternativa equivalente: colar os 4 ficheiros de `migrations/` um a um, **por ordem**.

### Opção B — CLI
```bash
npx supabase login
npx supabase init                      # só se ainda não existir supabase/config.toml
npx supabase link --project-ref nankvmfyyncoopoxqibm
npx supabase db push
```
Se o projeto já recebeu o `apply_all.sql`, marcar antes as migrações como aplicadas:
`npx supabase migration repair --status applied 20260926090000 20260926090100 20260926090200 20260926090300`.

### Regenerar o `apply_all.sql` depois de editar uma migração (Git Bash)
```bash
cd supabase && { sed -n '1,17p' apply_all.sql; for f in migrations/2026092609*.sql; do printf '\n-- >>> %s\n\n' "$f"; cat "$f"; done; printf '\ncommit;\n\nselect %s as status;\n' "'Erasmus Help chat schema applied'"; } > apply_all.new && mv apply_all.new apply_all.sql
```

### Verificação rápida (SQL Editor)
```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;             -- 5 tabelas, rowsecurity = true
select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public';
select id, public, file_size_limit from storage.buckets where id = 'chat-audio';                  -- public = false
```

## 2. Definições obrigatórias no Dashboard

1. **Authentication → Sign In / Providers → Allow anonymous sign-ins: ON** (está desligado neste projeto). A app faz `signInAnonymously()` por dispositivo.
2. **Authentication → Attack Protection → CAPTCHA (Cloudflare Turnstile): fortemente recomendado.** Sem isto, qualquer script cria utilizadores anónimos à vontade. **Atenção: o frontend AINDA NÃO envia `options.captchaToken`** — ativar o CAPTCHA antes dessa integração parte o Chat (erro `captcha_required`). Passos: criar um site Turnstile na Cloudflare, pôr a site key (pública) em `VITE_TURNSTILE_SITE_KEY`, integrar o widget antes de `signInAnonymously({ options: { captchaToken } })` e só então ativar aqui. Até lá, baixar o rate limit de sign-ins anónimos (Authentication → Rate Limits).
3. **Authentication → Rate Limits**: baixar "anonymous sign-ins" por IP/hora (ex.: 10–30).
4. **Data API → Exposed schemas**: manter só `public` (+ `graphql_public`). **Nunca** expor `private`.
5. Nada a fazer em Realtime/Storage: a migração 4 cria o bucket e adiciona as tabelas à publicação `supabase_realtime`.
6. Frontend: `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (a anon/publishable key é pública; a proteção é o RLS). A service role key **nunca** vai para o frontend.

## 3. Promover um admin

Só o dono do projeto, no SQL Editor (aí `auth.uid()` é nulo e a guarda permite). Um admin nunca se auto-atribui nem promove outros admins.
```sql
select id, public_id, display_name, role from public.profiles where public_id = 7;   -- a app mostra "ID 07"
update public.profiles set role = 'admin' where public_id = 7;
-- despromover: update public.profiles set role = 'student' where public_id = 7;   ('monitor' → volta a 'pending')
```
Depois disso o admin verifica monitores (`admin_verify_monitor`) e dá permissão de grupos (`admin_set_can_manage_groups`) a partir da app.

## 4. Modelo de segurança (resumo)

- **Papéis**: `student` | `monitor` (começa `pending`; poderes só depois de `verified` por um admin) | `admin` (só por SQL).
- **RLS em todas as tabelas, negar por omissão**, policies só `to authenticated` (utilizadores anónimos da Supabase são `authenticated`; `anon` = sem sessão → nada).
- **Escritas** em `monitor_students`, `conversations`, `conversation_members`: só via RPCs `security definer`. Clientes só inserem `messages` diretamente (RLS: remetente = eu, sou membro, conversa não arquivada; áudio só se o objeto existir no Storage e for meu).
- **`profiles`**: outros utilizadores só veem `id, public_id, display_name, role, monitor_status, my_language, created_at` (privilégios por coluna). Cidade/país/idioma da app só o próprio (`get_my_profile`) e admins (`admin_list_users`). Um `select('*')` em `profiles` falha (42501) — selecionar colunas explícitas.
- **Guarda do perfil** (trigger): ninguém muda o próprio `role`/`monitor_status`/`can_manage_groups`; novos monitores ficam `pending`.
- Erros das RPCs: `P0001` + mensagem `not_authenticated | not_allowed | not_found | invalid_input | already_associated | already_member | not_verified | archived | last_manager` (ver `parseChatRpcError` em `src/services/chat/types.ts`).

## 5. Notas para o frontend

- Mensagens: gerar o `id` no cliente (`crypto.randomUUID()`) → reenvios idempotentes; `created_at` é sempre hora do servidor.
- Histórico: `messages` filtrado por `conversation_id`, `order created_at desc, id desc`, paginação por keyset.
- Áudio: upload para `chat-audio/{conversationId}/{uuid}.{webm|ogg|oga|m4a|mp4|mp3|aac}` com `contentType` **sem** `;codecs=…` (ex.: `audio/webm`), ≤ 5 MB, ≤ 5 min; depois inserir a mensagem `kind='audio'`. Reproduzir com `createSignedUrl` de curta duração (60–300 s). Não há upsert/overwrite/delete.
- Realtime (Postgres Changes, filtrado por RLS): `messages` INSERT (`filter: conversation_id=eq.<id>`), `conversation_members` UPDATE (recibos de leitura: `last_read_at`), `conversations` UPDATE (lista).
- Não lidas: `list_my_conversations().unread_count` (máx. 100 → mostrar "99+"); ao abrir uma conversa chamar `mark_conversation_read`.
- "Lida" (✓✓) = `last_read_at` de todos os outros membros ≥ `created_at` da mensagem (`list_conversation_members`).

## 6. Testes (pgTAP)

Precisam de uma stack local (Docker): `npx supabase start` e depois `npx supabase test db`. Tudo corre numa transação com rollback.
As policies de Storage são testadas com INSERTs reais em `storage.objects` (RLS) e através das funções que elas usam (`private.can_upload_*` / `private.can_read_chat_audio`).
`chat_directory.test.sql` começa com a tabela `profiles` vazia e o contador a 0 **dentro da transação** (IDs determinísticos 1..101); enquanto corre, os registos reais na mesma base esperam uns segundos pelo lock do contador.
As asserções dentro de `todo(...)` documentam **bugs conhecidos** (comentários `BUG-n`): falham sem partir a execução; quando a correção entrar, o pgTAP avisa "unexpectedly succeeded" → retirar o `todo()`.

Scripts contra a stack local em execução (só `127.0.0.1`/`localhost`; apagam os utilizadores que criam):
```bash
supabase/scripts/test_public_id_concurrency.sh 40   # N registos em paralelo (+ variante com ROLLBACK + "dois separadores"): IDs únicos e sem buracos
node supabase/scripts/api_security_check.mjs        # 3 utilizadores anónimos via supabase-js: um estranho não lê/escreve nada de A–B (precisa de node_modules)
```
O script de concorrência usa `psql` (`DB_URL`, por omissão a base local) e no fim repõe o contador se ninguém mais se registou entretanto (`KEEP_COUNTER=1` para não repor). O script da API lê `API_URL`/`PUBLISHABLE_KEY`/`SECRET_KEY` do ambiente ou de `supabase status -o env` (`SUPABASE_BIN` para outro binário), gasta 3 sign-ins anónimos (limite local: 30/hora/IP) e 3 IDs públicos.

## 7. Tipos TypeScript

`src/services/supabase/database.types.ts` foi escrito à mão no formato de `supabase gen types`. Depois de ligar o projeto:
```bash
npx supabase gen types typescript --project-id nankvmfyyncoopoxqibm --schema public > src/services/supabase/database.types.ts
```
Os tipos de domínio (camelCase) estão em `src/services/chat/types.ts`.

## 8. Privacidade (incluir no aviso de privacidade da app)

- **Os administradores podem ler todas as conversas, participantes e mensagens (incluindo áudio) para moderação.**
- Áudio guardado num bucket **privado**; só membros da conversa (e admins) o podem ler, através de URLs assinados temporários.
- Colegas de grupo veem apenas nome, ID público, papel e idioma principal — não a cidade/país.
- Apagar um utilizador em `auth.users` apaga o perfil, as associações, as mensagens que enviou e as conversas diretas em que participa (cascata). Os ficheiros de áudio **não** são apagados automaticamente.
- **Retenção ainda não implementada**: não há expiração de mensagens nem limpeza de áudios órfãos (fazer com Edge Function/cron + Storage API; o Storage não permite apagar objetos por SQL).
- Identidade anónima por dispositivo: se o utilizador apagar os dados do browser, perde a sessão e passa a ter um novo ID (o antigo fica órfão). Considerar mais tarde "linking" da conta anónima a email/OAuth.

## 9. Limitações conhecidas

- **Realtime DELETE**: eventos DELETE não passam por RLS e chegam (só com a chave primária — UUIDs) a quem subscrever a tabela; ex.: sair/remover de grupo expõe o par `(conversation_id, user_id)`. Sem conteúdo, mas é metadado. Evolução: Realtime Broadcast com canais privados.
- Sem rate limit por utilizador no envio de mensagens (só os limites gerais da API).
- Monitores verificados podem consultar alunos por ID público sequencial (por desenho — só mostra nome e papel).
- Novos membros de um grupo veem o histórico anterior à sua entrada.
- Revogar a verificação de um monitor mantém as associações/conversas existentes (usar `admin_set_student_monitor` para mover alunos).
