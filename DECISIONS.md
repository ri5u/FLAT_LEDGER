# Decision Log (DECISIONS.md)

This log details the key architectural, product, and engineering decisions made during the development of the **Flatmate Ledger** application.

---

## 1. Split-Calculation Engine Gated from LLM
*   **Context**: The raw CSV contains messy math (percentages summing to 110%, conflict in splits, missing fields). LLMs are notoriously poor at exact arithmetic and deterministic rounding.
*   **Options Considered**:
    1.  *LLM-Driven Splitting*: Send the raw CSV to the LLM and let it calculate the final split shares.
    2.  *Gated Split Engine (Chosen)*: Let the LLM handle *classification/interpretation* only (Stage 2 review cards). Perform all currency conversions, rounding, percentage normalizations, and split calculations strictly in Node.js code (Stage 1 and Stage 3).
*   **Rationale**: Gated calculation ensures **100% mathematical consistency**. Rohan's "no magic numbers" requirement is satisfied because every number in `expense_splits` can be traced back to an exact formula in code, eliminating the risk of LLM calculation hallucinations.

---

## 2. API Transition: Claude to Google Gemini
*   **Context**: The initial design specified the Anthropic Claude API. The user did not have a paid Claude account but did have access to Google Gemini Pro/Advanced.
*   **Options Considered**:
    1.  *Force Claude API*: Require the user to create a developer billing account on Anthropic.
    2.  *Integrate Google Gemini API (Chosen)*: Re-engineer the LLM classification pipeline to utilize the Google Gemini API (via Google AI Studio).
*   **Rationale**: Google AI Studio provides a **generous Free Tier** (15 RPM for `gemini-1.5-flash`) that is perfect for development. Furthermore, Gemini's **Structured Outputs (Response Schema)** guarantees that the JSON returned by the model conforms exactly to our frontend review card schema, removing parsing brittleness.

---

## 3. Database Schema: Nullable Payer for Write-offs
*   **Context**: Anomaly A10 contains missing payers. The admin can choose to resolve this by marking the expense as a "Write-off" (meaning the cost is shared among everyone, but nobody fronted the money).
*   **Options Considered**:
    1.  *Non-nullable paidBy*: Force a system dummy user (like "Shared House") to be the payer.
    2.  *Nullable paidBy (Chosen)*: Modify the `Expense` table schema to make the foreign key `paidBy` optional (`paidBy Int?`).
*   **Rationale**: Optional `paidBy` is the cleanest relational representation of a write-off. In the balance calculation engine, if `paidBy` is null, splits are added as debts for participants but no creditor is credited, naturally reducing overall roommate balances without creating an artificial credit for anyone.

---

## 4. Peer-to-Peer Payments Treated as Transfers
*   **Context**: Aisha requested "one number per person." Rohan wanted to see exactly which transactions composed that number.
*   **Options Considered**:
    1.  *Minimum Cash Flow (Debt Simplification)*: Apply algorithms like Dijkstra's/Greedy to simplify debts (e.g. A owes B ₹50, B owes C ₹50 -> A owes C ₹50).
    2.  *Pairwise Balances + Direct Transfers (Chosen)*: Keep all splits between the actual participants, and record settlements directly as a distinct `Transfer` table. Aggregate net balances by subtracting transfers from splits.
*   **Rationale**: Minimum cash flow algorithms break the audit trail because they create "virtual" debts that don't match any real-life expense. The pairwise approach satisfies Aisha's "one number" requirement while fully preserving the Rohan drill-down audit trail.

---

## 5. Local Heuristics Classifier Fallback
*   **Context**: The application depends on an external LLM API for import classification. If the API is offline or the rate limit is hit, the application must not crash.
*   **Options Considered**:
    1.  *Strict LLM dependency*: Fail the import upload if the LLM API is unreachable.
    2.  *Heuristics Fallback (Chosen)*: Implement a secondary, local classifier in JavaScript using string similarity (Levenshtein) and regex keyword matching to generate review cards locally.
*   **Rationale**: High-reliability software must fail gracefully. By falling back to local heuristics, the user can still import and resolve the CSV even if they are offline or the Google AI Studio quota is exhausted.
