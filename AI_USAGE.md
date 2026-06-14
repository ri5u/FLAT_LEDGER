# AI Tools & Usage Log (AI_USAGE.md)

This log documents the collaboration with AI assistants (**Claude** during the design phase, and **Antigravity** during the build/implementation phase) to plan, design, build, and debug the **Flatmate Ledger** application.

---

## Phase 1: Design & Planning Phase (Collaborator: Claude 3.5 Sonnet)

**Claude (Sonnet 3.5)**, via the Claude.ai chat interface, was used as a design partner during the planning phase — before any code was written — to:
*   Analyze the provided `Expenses_Export.csv` and catalog data anomalies.
*   Work through product/design decisions interactively (Q&A style).
*   Produce the final [DESIGN.md](file:///home/r15u/webDev/flat_ledger/DESIGN.md) design document.

Below is the log of the design-phase conversation, detailing each prompt, a summary of Claude's response, and the decision/outcome that resulted.

### Prompt 1: Initial Brief
> "I am working on an application. You are expected to act as both Product Manager and Developer. Four flat mates — Aisha, Rohan, Priya, and Meera — have tracked shared expenses in a spreadsheet since February... [full assignment brief, including each flatmate's request and the core import requirement]... For now we are not going to work on the codebase immediately. First of all we are going to go through the csv... Then after that we are going to create a design doc... Ask me all the queries you have."

**Claude's response:**
*   Loaded and analyzed `Expenses_Export.csv` programmatically and identified **18 distinct anomalies** across 42 rows — duplicates, a settlement logged as an expense, USD-as-INR amounts, negative/zero amounts, formatting issues, name inconsistencies, ambiguous/non-standard dates, membership-related splits, percentage splits not summing to 100%, and a `split_type`/`split_details` conflict.
*   Asked 9 clarifying questions covering: duplicate resolution, external guests in splits, USD conversion approach, Meera's removal from a stale split, settlement/transfer handling, tech stack, deployment, auth, and the approval/review flow.

**Outcome:** Established the anomaly inventory that everything else is built around, and opened the design discussion.

---

### Prompt 2: Design Ground Rules & Anomaly Handling
> "we will keep the correct entry for thalasa dinner. 1. As the application has this feature of people joining and leaving a group at anytime. We will keep those two guests in our expenses. On the trip they joined the group shared the expenses and then after trip left. 2. I think we will go with the third option in this case. As we want to share the expenses fairly. 3. Yeah we can remove meera from the group. 4. We can exclude them while also logging them for those two users? 5. I am familiar with the javascript so i think node backend should be fine with react as frontend. Also the task explicitly says that we have to use a relationaldb so maybe postgresql or mariadb?? 6. ... maybe i can make a docker image and use that to host on aws??? 7. yeah i think we can have something like jwt for it. What do you think we should go with?? 8. ... we might as well assign a group admin who can review the changes and stuff and meera could be the leader. But there would be issue when meera leaves. So what should we do..... Also i am curious on how we will solve a lot of these issues that are in the csv... i don't want to solve every single issue. I want to solve all the most relevant ones."

**Claude's response:**
*   Confirmed: temporary members (Dev, Kabir) participate via a time-bounded membership concept; Kabir's parasailing share is absorbed into Dev's; date-of-expense FX rate via a public API (frankfurter.app); Meera auto-removed from the stale split with a log entry; settlements/deposits excluded from balances but logged in a dedicated transfers view.
*   Recommended **Node + Express + React + PostgreSQL** (Prisma ORM), and **AWS EC2 + Docker** as a viable, simple hosting path.
*   Proposed JWT + bcrypt for authentication.
*   Solved the "Meera as admin, then she leaves" problem by making **admin a role that transfers between users**, not tied to a specific person.
*   Split the 18 anomalies into three buckets: auto-resolve silently (with a log entry), auto-resolve with a flag, and require admin approval — as a first pass at the eventual review-card design.

**Outcome:** Locked in the core tech stack, hosting direction, auth approach, and the admin-role design. First draft of the anomaly-handling buckets.

---

### Prompt 3: Server Sizing & Report Format
> "the free plan on railway has very low spec... On aws i have free credits for the ec2... I would go with a pdf/csv. ... I think i will keep it simple and build it for one flat only."

**Claude's response:**
*   Confirmed EC2 + Docker (with Postgres either via RDS or a second container) as the deployment plan.
*   Confirmed single-flat scope keeps the schema, auth, and admin model simple.
*   Asked two follow-up questions: minimum-cash-flow vs. pairwise balances, and eager (stored) vs. lazy (computed-on-read) expense splits.

**Outcome:** Deployment target = EC2 + Docker; scope = one flat only.

---

### Prompt 4: Balance Model & Split Logic
> "nah although i want to give aisha a clear single number at the end.. i would like to have each transaction logged...so i think pairwise is a better choice. Also did we have the split type stuff right? So money divided would be based on the split type."

**Claude's response:**
*   Confirmed **pairwise balances** (not minimum cash flow) — better traceability, satisfies Rohan's "no magic numbers" request.
*   Walked through all four `split_type`s found in the CSV (`equal`, `percentage`, `share`, `unequal`) with worked numeric examples.
*   Asked for confirmation on: (a) whether `unequal` splits should be validated against the expense total, and (b) confirmation of the `share`-split math on the April rent row.

**Outcome:** Pairwise balances confirmed. Split-type formulas drafted for all four types.

---

### Prompt 5: Exception Ingestion Engine
> "This is the critical part... [restated the core import requirement: detect, surface, handle every anomaly; no crash, no silent guess]... As for that unequal case you mentioned. That simply means that out of 1500 rohan paid, 700 was paid by rohan and 400 each by priya and meera."

**Claude's response:**
*   Confirmed the `unequal` split interpretation (payer's own share is excluded from what others owe them).
*   Reframed the import requirement as a **two-phase pipeline**: Phase 1 (automated, runs immediately) + Phase 2 (admin review queue, import stays "pending" until resolved).
*   Asked one remaining question: how to handle the ambiguous date (Row 32) — flag with a suggested interpretation, or flag with no suggestion?

**Outcome:** Two-phase import pipeline concept introduced — this becomes the backbone of the final design.

---

### Prompt 6: Parsing Errors vs. Anomaly Review
> "What would be better? A direct crash but it floats a list of all the anomalies to the user? Or we give them an option to resolve it."

**Claude's response:**
*   Compared "crash with error list + manual CSV fix + re-upload" against "never crash, resolve via the app." Argued the crash approach violates the "no manual CSV editing" rule, produces no audit trail, and conflates parsing errors with business-logic decisions.
*   Recommended: **never crash** — auto-fix what's mechanical, queue what's ambiguous for the admin, commit only once the queue is empty.

**Outcome:** "Never crash, resolve via review queue" established as the import philosophy.

---

### Prompt 7: Review Screen Design
> "I am still not sure on how the user will actually handle the import error? how do we tell them to fix the stuff? Do we give them prompts and options on what to fix? Do we float them a list of errors to fix it and come back and upload?"

**Claude's response:**
*   Compared three UX options: (A) error list + manual fix + re-upload — ruled out, violates the brief; (B) one-by-one wizard for every anomaly — ruled out, too noisy (mixes trivial fixes with real decisions); (C) **single two-section review screen** — Section 1 read-only auto-fix log, Section 2 review cards with 2–3 button choices per ambiguous item, "Commit" enabled once all cards are resolved.
*   Recommended Option C with concrete example cards for several of the CSV's anomalies (duplicates, settlement, missing payer, ambiguous date, Kabir, Sam's deposit).

**Outcome:** The two-section review screen (auto-fix log + decision cards) became the core import UX, satisfying Meera's approval requirement.

---

### Prompt 8: Context-Aware Anomaly Boundary
> "you say that we will get this based on context? Row 26: Missing currency — assumed INR based on context ✓ Row 34: Meera included in April split after move-out — removed but how are we getting the context? do i use a free llm api in the background for processing these errors? That would make it quite complicated, don't you think? The csv doesn't give an idea on who moved in or who moved out?? And these kinds of things cannot be just done by parsing?"

**Claude's response:**
*   Acknowledged the earlier "context" framing was hand-wavy.
*   Clarified: Row 26 (missing currency → INR) **is** a pure hardcoded fallback rule, no LLM/context needed.
*   Clarified: Row 34 (Meera in an April split) **cannot** be resolved by parsing alone — there's no membership data in the CSV — so it must move from "auto-resolve" to a **review card**.
*   Re-split all anomalies into "truly auto-resolvable by parsing/math alone" vs. "requires human input via a card."

**Outcome:** Sharpened the auto-fix vs. review-card boundary; removed the false assumption that the parser could "understand" membership changes.

---

### Prompt 9: Extracting Membership Context
> "again how are we deciding that?... How are figuring out if meera moved out or not? We can't get that from just parsing, can we?? We can't understand that from the nots either? There is no logical pattern anywhere??"

**Claude's response:**
*   Conceded fully: there is genuinely no way to know Meera moved out from the CSV via parsing alone, and the notes are just opaque strings to a parser.
*   Proposed that membership information needs to come from **somewhere** — initially suggested an upfront "onboarding" step where the admin manually registers each member's join/leave dates before import.

**Outcome:** Identified the core gap — the CSV alone cannot establish a membership timeline — and proposed (provisionally) an onboarding-based fix.

---

### Prompt 10: Timelines Under Uncertainty
> "we can't know who will leave when? we can't be predicting that? what if we don't know that meera will leave on 31st of march? what if we get that information a few days before she leaves? What then? This is the issue? And csv is the only source of information that we have."

**Claude's response:**
*   Agreed: predicting future membership changes during onboarding is unrealistic — the CSV really is the only source of truth available at import time.
*   Proposed that membership changes are **discoverable as patterns** in the CSV itself (e.g., Meera present in nearly all Feb/Mar splits, absent from April except one row; a "Meera farewell dinner" note as a signal) — but that pattern-detection should only ever produce a **flagged question**, not an auto-applied conclusion, to avoid silent wrong guesses.

**Outcome:** Membership changes are detected as *statistical inconsistencies* in the data and always surfaced as review cards — never inferred and auto-applied.

---

### Prompt 11: LLM Engine Design
> "or we can use an LLM for parsing? thoughts on that? use an api pass that csv to the LLM which we have setup with a system prompt for how to process the csv. Let the llm auto fix the trivial issues and float a form where we need the input from the user. User corrects things and then we pass those info to the llm and it processes and cleans up data. After a complete cleanup and fixup we will give a preview of the file to the user and then confirm the commit?? thoughts?"

**Claude's response:**
*   Endorsed the LLM-assisted approach as the right tool for the genuinely context-dependent anomalies (reading notes like "Meera farewell dinner", "Sam moving in!", fuzzy name matching, duplicate/settlement classification).
*   Raised practical considerations: structured/forced JSON output is essential (not free-form prose), token usage is trivial for this dataset, cost is negligible, the LLM can still be wrong so a preview-before-commit step is required, and the import report should be generated from the LLM's structured decision log.
*   Sketched a two-pass LLM design (Pass 1: detect + propose; Pass 2: apply decisions + finalize) and recommended storing the raw CSV alongside cleaned data.
*   Asked which LLM provider to use.

**Outcome:** LLM-assisted classification adopted as Stage 2 of the import pipeline, with Anthropic's Claude API as the provider (already in use for this conversation).

---

### Prompt 12: Drafting the Design Document
> "Let's create a design doc based on these things now. I will rectify it if something else comes to my mind. So taking into account the core import feature and the minimum feature requirements for the page. Let's create one design doc... The tools, the flow, the dfd, every single thing. The apis for the frontend. Database, database schemas. Everything for the application that we need."

**Claude's response:**
*   Produced [DESIGN.md](file:///home/r15u/webDev/flat_ledger/DESIGN.md), covering: requirements, tech stack, system architecture, anomaly catalog (A1–A19) with detection method/resolution policy, import pipeline data flow, database schema, split formulas, REST APIs, frontend wireframes, and deployment specs.
*   Refined: Simplified the two-pass LLM design to a single classification pass. The LLM only classifies anomalies, while all money arithmetic is handled by deterministic backend code.

**Outcome:** [DESIGN.md](file:///home/r15u/webDev/flat_ledger/DESIGN.md) finalized as the agreed design baseline.

---

### Key Decisions Resulting From This Phase

| Area | Decision |
|---|---|
| **Tech stack** | Node.js + Express + Prisma + PostgreSQL (backend), React + Vite + Vanilla CSS Custom Glassmorphic Theme (frontend) |
| **Hosting** | Single Docker Composition on VM (VM + Postgres container) |
| **Auth** | JWT + bcrypt; admin is a transferable role, not tied to one person |
| **Scope** | Single flat, single ledger (no multi-group support) |
| **Balances** | Pairwise (not minimum cash flow), computed dynamically from `expense_splits` + `transfers` |
| **Currency** | USD converted to INR using the historical date-of-expense rate from `frankfurter.app` |
| **Import philosophy** | Never crash, never silently guess — two-stage pipeline: deterministic auto-fixes (logged) + LLM-assisted review cards (admin must resolve before commit) |
| **LLM role** | Classification/interpretation only (duplicates, settlement vs. expense, membership inconsistencies, identity matches); all money math is deterministic backend code |
| **Membership tracking**| No predictive calendar — membership timelines derived dynamically from admin decisions made during import review |
| **Settlements/transfers**| Excluded from balance calculations, logged in a separate `transfers` table, netted into final pairwise balances |
| **UX Requirement** | Two-section import review screen (auto-fix log + decision cards) — admin must resolve every card before commit |

---

## Phase 2: Build & Implementation Phase (Collaborator: Antigravity / Gemini)

This phase documents the implementation, code generation, testing, and debugging using the agentic developer AI assistant **Antigravity** running on Gemini.

### Key Prompts & Iterations
*   **Prompt 1: Project Bootstrap**: Setup environment context, verify directories, implement base controllers, routes, schemas, and seed scripts.
*   **Prompt 2: API Transition to Gemini**: Replaced Anthropic Claude references with Google Gemini API (via `@google/generative-ai` package using structured outputs response schemas) to make use of the free Google AI Studio tier.
*   **Prompt 3: Build & Dockerize**: Compiled frontend React code, updated Express serving paths, created the Docker Compose architecture, and deployed the environment.
*   **Prompt 4: End-to-End Integration Testing**: Coded and executed an automated E2E testing script to simulate a complete ledger upload, anomaly resolve process, commit, and report download.
*   **Prompt 5: Secure Direct Downloads**: Allowed token query parameter fallbacks in Express middleware to support standard browser download links for CSV and PDF reports.

---

## Phase 2 Concrete Cases of Debugging & Adjustments

During implementation, we actively tested the code and resolved five critical system adjustments:

### Case 1: Expired Docker Daemon Credentials
*   **What Went Wrong**: Running `docker compose up -d db` failed with the error: `Error response from daemon: authentication required - personal access token is expired`.
*   **How We Caught It**: Inspected the console output of the Docker command.
*   **What We Changed**: Ran `docker logout` to clear the expired credentials, allowing Docker to pull public images (`postgres:15-alpine`) anonymously and successfully.

### Case 2: Inaccurate Google Generative AI Export Class
*   **What Went Wrong**: The AI initially wrote `import { GoogleGenAI } from '@google/generative-ai'` and instantiated `new GoogleGenAI({ apiKey })`. Running the import script failed with `SyntaxError: The requested module '@google/generative-ai' does not provide an export named 'GoogleGenAI'`.
*   **How We Caught It**: Executed a local node script and inspected the runtime compilation error. We then ran `node -e "import('@google/generative-ai').then(m => console.log(Object.keys(m)))"` to inspect the module's export keys.
*   **What We Changed**: Changed the import to use the correct class `GoogleGenerativeAI` and updated the instantiation to `new GoogleGenerativeAI(apiKey)`.

### Case 3: Missing Conflicting Duplicate (Thalassa) in Heuristics
*   **What Went Wrong**: The initial local heuristic duplicate check grouped rows by `date + amount`. While this worked for Row 5 & 6 (Marina Bites), it missed Anomaly A2 (Thalassa Row 24: ₹2400 Aisha vs Row 25: ₹2450 Rohan) because their amounts differed.
*   **How We Caught It**: Ran our E2E integration test script and noticed that only 8 review cards were generated instead of 9, missing the Thalassa duplicate.
*   **What We Changed**: Re-engineered the heuristic duplicate detector to compare every active row pair on the same date. We implemented a token-based description overlap check (ignoring stop words like "dinner") combined with a relative amount variance threshold (within ±10%). This successfully caught the Thalassa duplicate and pre-selected Rohan's row 25 based on his note context.

### Case 4: Non-Nullable paidBy Field Mismatch for Write-offs
*   **What Went Wrong**: The database schema initially defined `paidBy Int` as a required field in the `Expense` model. However, Anomaly A10 (Missing Payer) supports a "Write-off" resolution where no roommate is credited for fronting the money. A non-nullable field would crash the transaction unless a dummy user was created.
*   **How We Caught It**: Reviewed the database schema constraints during Stage 3 implementation.
*   **What We Changed**: Modified [schema.prisma](file:///home/r15u/webDev/flat_ledger/backend/prisma/schema.prisma#L72) to make `paidBy` nullable (`paidBy Int?` and `payer User?`), created and applied a Prisma migration (`make_payer_nullable`), and updated the balance aggregator to treat null payers as write-offs.

### Case 5: PDF Audit Report Download "Access token required" Error
*   **What Went Wrong**: Users attempting to download the PDF or CSV audit report directly via browser hyperlinks (`<a href="..." target="_blank">`) received a `"Access token required"` error from the Express server. Standard browser clicks do not forward custom headers such as `Authorization: Bearer <token>`.
*   **How We Caught It**: Attempted direct URL navigation to `http://localhost:5000/api/imports/4/report?format=pdf` in a browser.
*   **What We Changed**: Updated the Express authentication middleware [auth.js](file:///home/r15u/webDev/flat_ledger/backend/src/middleware/auth.js#L8-L12) to accept the JWT token via a query parameter `?token=...` when the standard auth header is missing. Then, updated [Import.jsx](file:///home/r15u/webDev/flat_ledger/frontend/src/pages/Import.jsx#L523-L541) to pull the token from local storage and append it dynamically to the download urls, allowing instant downloads on button click.
