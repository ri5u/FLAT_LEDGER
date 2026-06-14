# AI Tools & Usage Log (AI_USAGE.md)

This log documents the collaboration with **Antigravity (AI assistant)** to build the Flatmate Ledger application, including the key prompts and concrete cases of code adjustments.

---

## 1. AI Tools Used
*   **Primary AI Collaborator**: Antigravity (Google DeepMind) running on Gemini.
*   **Interface**: Agentic IDE code editing environment.

---

## 2. Key Prompts & Iterations
*   **Prompt 1**: "Let's setup the context and trust"
    *   *System Action*: Analyzed workspace directories, parsed Spreetail PDF requirements, reviewed raw CSV rows, and produced `development_plan.md` mapping out the roadmap and 19 anomalies.
*   **Prompt 2**: "let's make some change to the llm stuff... can i use gemini's api?"
    *   *System Action*: Analyzed Google AI Studio pricing and limits, recommended the Gemini Free Tier, and updated all references of Claude/Anthropic to Gemini across project files.
*   **Prompt 3**: "continue working"
    *   *System Action*: Bootstrapped Docker environment, implemented routes, controllers, split engine, and created an E2E testing script to run the CSV stream imports.

---

## 3. Concrete Cases of Debugging & Adjustments

During development, we actively tested the code and resolved four critical system adjustments:

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
*   **What We Changed**: Modified `schema.prisma` to make `paidBy` nullable (`paidBy Int?` and `payer User?`), created and applied a Prisma migration (`make_payer_nullable`), and updated the balance aggregator to treat null payers as write-offs.
