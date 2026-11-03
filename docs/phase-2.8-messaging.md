# Phase 2.8 · Simple messaging & follow-up awareness

## Scope and prerequisite inspection

Inspection confirmed local `HEAD` at `45927aa`, the Phase 2.7 publication commit at `fae5887`, and the local `origin/main` reference also at `45927aa`. No network Git fetch, commit, push, reset, clean, rebase or deployment was performed. Pre-existing generated `next-env.d.ts` changes and three `.DS_Store` files were not intentionally discarded. Existing migration 012/013, publication mapping, immutable advertiser ownership, archived visibility and published-photo delivery were inspected before implementation. Messaging uses that publishing workflow; it does not create another one.

## User experience

- Dashboard navigation and the existing compact dashboard messaging line link to `/dashboard/messages`. Existing dashboard/homepage layout is preserved.
- Desktop: property-linked conversation list beside selected history/composer. Below 700px: list-to-conversation navigation with an explicit back link. Shared Electric Calm fonts, tokens and semantic CSS; no new dependencies.
- All/Unread filters, 20 conversations per page, refresh button, property thumbnail/title/locality/city/price, participant display name, latest activity/preview, private unread indicator, and quiet waiting/reminder labels.
- Eligible non-demo public details offer **Contact Advertiser**, or **Continue conversation** after an inquiry. Own listings explain where incoming messages appear. Demo listings explicitly have no live messaging.
- Opening contact creates no records. The first successful message transaction creates the conversation and both participant states. No attachments or HTML rendering: React renders message text as text.
- Messages update on opening/reloading or **Refresh messages**, not automatically in real time. Load older messages fetches 50 at a time using a bigint message-ID cursor; message IDs travel as strings to avoid precision loss. History displays chronologically.

## Database

Forward-only `014_messaging.sql` adds:

1. `conversations`: advertisement ID, seeker/advertiser account IDs, server creation/activity timestamps; unique `(listing_id,seeker_id)` and distinct-participant check.
2. `conversation_messages`: sender, conversation, sender-scoped unique request UUID, 1–4,000-character text, server timestamp, indexed ordered identity.
3. `conversation_participants`: each account's monotonic read watermark and optional dismissed exchange message ID.
4. `messaging_write_limits`: persistent per-account rolling minute/day buckets.

Foreign keys cascade account/conversation removal into message/state records. Listing references do not cascade silently. Existing publication account-deletion guards still take precedence for advertiser accounts with retained publication history. Database triggers protect immutable conversation identity and reject messages/state for nonparticipants. Application SQL stays in the module repository and binds values through Postgres.js tagged templates.

## Authorization and concurrency

Every private page/API requires a verified Better Auth session. APIs accept no sender, recipient or account ownership input. The recipient must match a live `listing_publications` record, published non-demo listing, non-demo advertiser, matching active profile and verified account. Self-contact is denied. A self-declared profile type grants no additional authority.

Reads/writes scope conversation IDs to either participant; outsiders receive 404, including moderators and publishers. Other users' email, phone, account IDs and read state are never in the messaging projection. Message content voluntarily typed by participants is not contact-redacted.

Sends lock the sender account, then check/lock live listing and advertiser-profile eligibility, then lock the conversation. Unpublishing/suspension cannot race past eligibility locks. A unique conversation constraint and transactional upsert protect concurrent creation. `(sender_id,request_id)` protects ambiguous retries across workers/sessions. Reusing a key with a different text/target yields 409. Replaying a successful send after suspension or unpublishing returns its original receipt without adding a message. Failed creations leave no empty thread. Successful sends update latest activity in the same transaction.

Limits: 20 sends/minute and 200/day per account. Idempotent replays consume no additional send budget; failed sends do not consume it. Exceeded buckets reject before inserts. Mutation payloads are strict Zod, JSON only, origin-checked against configured Better Auth origin, and streamed bodies are capped at 24 KiB. Maximum text is 4,000 characters. Pages cap at 1,000; cursors are validated positive PostgreSQL bigint strings. APIs emit private/no-store, cookie variance, no-referrer and noindex headers, including errors. No message contents or credentials are logged.

## Read and follow-up state

- Opening a conversation in a visible tab marks only the newest fetched message ID read. Watermarks use `greatest` so stale acknowledgements cannot move backwards. Sending does not mark unseen incoming messages read. Newer messages arriving after the fetched page remain unread. No delivery/public read receipts.
- Seeker waiting is calculated from actual messages: find the last advertiser reply, then the first seeker message after it. No such message means no waiting/reminder.
- At **48 hours inclusive**, measured with the database server clock, show **Follow-up suggested** inside Messages only. Subsequent seeker messages do not restart the timer.
- Dismissal saves that first unanswered message's ID for this seeker/conversation only. It stays dismissed through additional seeker messages. An advertiser reply clears waiting; a later seeker exchange has a different first-message ID and can become eligible again.
- Stale dismissals reject with 409. Advertisers cannot dismiss seeker reminders. There is no cron, automatic sending, email/push reminder, interpretation of silence, responsiveness score or separate tracking dashboard.

## Unavailable listings and advertisers

Unpublishing/archive removes the complete property context object (title, location, price, thumbnail path and public link) from inbox/detail projections. No cached property snapshot is stored. The UI says **Listing no longer available**, keeps authorized private message history, and pauses new messages in either direction. New inquiries are rejected. Public photo routes independently return 404. This does not claim rented/sold/reserved status. Messages may themselves contain details that participants voluntarily typed; these remain part of private history.

Advertiser suspension, missing profile, unverified account or changed/missing eligibility similarly pauses sends and new contact. Existing participant history remains accessible if the current reader still has a verified session. Profile suspension does not privatize an otherwise published listing: public context remains until unpublishing. Account deletion cascades private conversation data for both sides where allowed by existing account/publication rules; there is no self-service deletion workflow in this phase.

## Files and routes

- Domain: `src/modules/messaging/{validation,repository,http}.ts`.
- `GET /api/messages?page=1&filter=all|unread`: participant inbox.
- `POST /api/messages`: `{listingId,requestId,text}` for inquiry or `{conversationId,requestId,text}` for continuing.
- `GET /api/messages/:id?before=messageId`: history and safe context.
- `PATCH /api/messages/:id`: `{action:"read",through}` or `{action:"dismiss",exchange}`.
- Page/loading: `src/app/dashboard/messages/`.
- Components/styles: `src/components/messages.tsx`, `src/components/contact-advertiser.tsx`, `src/app/messages.css`.
- Sign-in destinations allow only exact internal listing/message routes, not arbitrary URLs/query strings.

## Manual acceptance

1. Run migrations, start PostgreSQL/Mailpit/app; register and verify separate advertiser, seeker, moderator and publisher accounts through the local Mailpit UI. Never use real personal data for fixtures.
2. As advertiser, create an active profile and complete private draft with photos. Submit it; have a separately granted moderator approve and a separately granted publisher explicitly publish the exact snapshot. Use Phase 2.7 instructions; approval alone does not publish.
3. Anonymous listing contact should sign in and return safely. A demo must state live messaging is unavailable. Advertiser cannot self-contact. Merely opening the composer creates no conversation.
4. As seeker, send an inquiry; verify context and waiting label. Return to listing and use Continue conversation. Check persistence after logout/sign-in and after refresh.
5. In a disposable test database only, age the first unanswered message timestamp by 49 hours (the automated publication browser test does this). Refresh: reminder appears; dismiss and reload: it stays dismissed. Send another unanswered seeker message: it remains dismissed.
6. As advertiser, use Unread, open inquiry, reply. Seeker sees unread, opens history and sees waiting/reminder cleared. Test another seeker question after the reply as a fresh exchange.
7. Try a conversation URL/API as a third account: deny with no data. Suspend the advertiser using the existing audited operator process: sending pauses, history persists. Restore eligibility afterward.
8. Unpublish through the existing publisher confirmation workflow. Both participants retain history with unavailable notice, no property title/photo/location/price/link or composer. Public images return 404; new inquiries fail.
9. At 375/768/1440px check overflow, keyboard focus, readable timestamps, back navigation, message scrolling and composer. Test two sessions' independent unread state, loading/errors, safe retry after an interrupted send and older-message pagination.

## Production limitations / recommended next milestone

This is not end-to-end encrypted. Private access controls are implemented, not a claim of production privacy/legal compliance. No abuse-report/blocking tools, content moderation, self-service deletion, retention/purge schedule, legal hold/export, consent/legal notices or production encryption/backup policy were added. Define those policies and operator workflows, conduct India-specific legal/privacy review, assess data residency/retention/deletion and provider access, add operational monitoring without message-body logs, and verify backups/recovery before production exposure. Account deletion currently removes the shared history when permitted; evaluate this explicitly with retention/legal needs.

Recommended next milestone: human four-account acceptance and messaging privacy/abuse/lifecycle hardening, not realtime infrastructure, CRM or automatic reminders. Physical devices, actual screen readers and exhaustive network interruption testing remain manual gates. Existing live-ad replacement remains separately scoped, not implemented by messaging.