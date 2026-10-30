# Project instructions

For any task that summarizes, audits, repairs, renders, or imports book content in this Readwise project:

1. Read `BOOK_SUMMARY_STANDARD.md` and `BOOK_SUMMARY_PRINCIPLE_GUIDELINE.md` before acting; treat both as required project guidance. The standard governs evidence and quality gates; the principle guideline governs summary voice and format.
2. Use the supplied original book files as the source of truth. Do not rely on existing summaries as proof of coverage.
3. Keep a source-to-summary coverage map for every content-bearing paragraph/section and complete semantic checks before marking a book ready.
4. Before adding any book to the Production catalog, revise its entire summary against the latest `BOOK_SUMMARY_PRINCIPLE_GUIDELINE.md` and the applicable master prompt. An old summary does not qualify merely because it is complete. Do not create a placeholder entry or import only part of a book. Add it only after every section passes coverage, fidelity, structure, current-guideline, and presentation checks.
5. Keep unfinished or not-yet-revised books in local drafts and process one whole book continuously. After the complete book passes the latest gate, publish the entire book as one completed import, unless the user changes that preference.
6. Never request or put database passwords in chat. If local authentication is needed, stage the verified import and explain the local step.

## Production authentication

- The user authorizes completed, verified whole-book imports using the existing macOS Keychain credential. Run `node scripts/import-content.cjs --keychain-only --batch=private/import-batches/<verified-book>.json` after the book passes all gates.
- Keep credential retrieval inside the local importer. Never print a password, put it in tool output, command arguments, environment files, logs, Git, or chat. Return only import results and verification receipts.
- In this workspace the sandbox could not read Keychain, while the same local importer outside the sandbox successfully read it. A failed sandbox lookup does not prove that the item is missing. Use the dedicated importer with the required execution permission before asking the user to recreate or re-enter a credential. Do not request unrestricted access to the whole machine.
- Automatic imports must use `--keychain-only`; if Keychain is unavailable, stop with a status message instead of opening an invisible password prompt. macOS may still require the user to unlock Keychain or grant access.
- Successful imports write credential-free JSON receipts in `private/import-receipts/`. These prove database/batch equality, not semantic completeness.

`CHAPTER_CONTENT_PROMPTS.md` is an older workflow note. When its length target, ordering suggestions, "ลองใช้วันนี้" section, or output shape conflicts with `BOOK_SUMMARY_STANDARD.md` or the user's attached master prompt, follow the standard and the user's prompt.
