# Plan: Paper Upload and Metadata Extraction Optimization

## TL;DR

> **Quick Summary**: Consolidate the two-step upload and extraction process into a single parallelized operation. Limit PDF parsing to the first 3-5 pages to drastically reduce processing time and redundant I/O.
> 
> **Deliverables**: 
> - Shared metadata extraction utility (`src/lib/pdf/metadata.ts`).
> - Optimized `/api/upload` route with parallel storage upload and extraction.
> - Refactored `/api/extract-metadata` using the shared utility.
> - Updated `UploadButton` component for consolidated API handling.
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Shared Utility → API Refactor → Frontend Update

---

## Context

### Original Request
The current process is slow due to sequential API calls, redundant file downloads from Supabase, and full-file PDF parsing. The goal is to return metadata in the upload response and limit parsing to the first few pages.

### Interview Summary
**Key Discussions**:
- **Extraction Strategy**: Consolidate metadata (title, authors, journal) and keyword extraction into a single AI call.
- **Standalone Endpoint**: Keep `/api/extract-metadata` for re-runs but refactor to share logic.
- **PDF Parsing**: Limit to first 3-5 pages using the `pdfjs-dist` proxy.
- **Response Structure**: Consolidated JSON including `file_url` and `metadata`.

### Research Findings
- `unpdf` is used for PDF parsing, but currently extracts all text.
- `/api/extract-metadata` currently makes a second AI call just for keywords if the title looks good.
- Redundant download from Supabase storage occurs in the current two-step process.

---

## Work Objectives

### Core Objective
Reduce perceived and actual latency of paper uploads by at least 50% through parallelization and partial file processing.

### Concrete Deliverables
- `src/lib/pdf/metadata.ts`: New shared utility for PDF metadata extraction.
- `src/app/api/upload/route.ts`: Updated to return metadata.
- `src/app/api/extract-metadata/route.ts`: Updated to use shared utility.
- `src/components/dashboard/upload-button.tsx`: Updated to handle single-call flow.

### Definition of Done
- [ ] Uploading a 50-page PDF takes < 10 seconds.
- [ ] Keywords are always returned in the metadata.
- [ ] No second API call is made from the frontend for extraction.
- [ ] Metadata is correctly identified even if only 3 pages are parsed.

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (Manual verification sufficient as per user)
- **User wants tests**: Manual-only
- **QA approach**: Manual verification via logs and UI behavior.

### Automated Verification (Agent-Executable)

**For API/Backend changes (using Bash curl):**
```bash
# Verify consolidated upload response
curl -v -X POST http://localhost:3000/api/upload \
  -F "file=@test-paper.pdf"
# Assert: JSON contains "file_url" AND "metadata" (title, authors, keywords)
```

**For Library/Module changes (using Bash node/bun):**
```bash
# Verify partial PDF extraction logic
bun -e "import { extractMetadata } from './src/lib/pdf/metadata'; const res = await extractMetadata(buffer, 'test.pdf'); console.log(Object.keys(res))"
# Assert: Output contains title, authors, journal, keywords
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation):
└── Task 1: Create shared metadata extraction utility
└── Task 2: Update AI prompt for consolidated extraction

Wave 2 (Integration):
├── Task 3: Refactor /api/upload to use Wave 1 utility
├── Task 4: Refactor /api/extract-metadata to use Wave 1 utility
└── Task 5: Update UploadButton component
```

---

## TODOs

- [ ] 1. Create Shared Metadata Utility (`src/lib/pdf/metadata.ts`)

  **What to do**:
  - Extract existing logic from `/api/extract-metadata/route.ts` into a standalone function `extractMetadataFromBuffer(buffer: Uint8Array, fileName: string)`.
  - Refactor PDF parsing to use `getDocumentProxy` and iterate only through the first 5 pages.
  - Combine heuristic extraction and AI refinement logic.

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
  - **Skills**: [`typescript`, `pdf-processing`]
  
  **Acceptance Criteria**:
  - [ ] Utility exists and handles partial parsing.
  - [ ] Function returns a consolidated object with title, authors, journal, and keywords.

- [ ] 2. Update AI Prompt for Consolidated Metadata

  **What to do**:
  - Modify `refineMetadataWithAI` to ALWAYS request keywords in the main extraction prompt.
  - Ensure the JSON schema in the prompt includes `keywords`.
  - Remove the separate `options.extractOnlyKeywords` logic if no longer needed.

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: [`ai-prompting`]

  **Acceptance Criteria**:
  - [ ] AI prompt explicitly asks for "3-5 Chinese keywords".
  - [ ] Single AI call returns all 4 main fields.

- [ ] 3. Refactor `/api/upload/route.ts`

  **What to do**:
  - Import `extractMetadataFromBuffer` from the new utility.
  - After creating `fileBuffer`, call extraction in parallel with storage upload using `Promise.all([uploadToSupabase, extractMetadata])`.
  - Update response JSON to include the extracted metadata.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`nextjs-api`]

  **Acceptance Criteria**:
  - [ ] `/api/upload` returns metadata.
  - [ ] Storage upload still succeeds.

- [ ] 4. Refactor `/api/extract-metadata/route.ts`

  **What to do**:
  - Replace internal processing logic with a call to the shared utility.
  - Ensure it still handles the `file_url` download case (for backwards compatibility or manual triggers).

  **Recommended Agent Profile**:
  - **Category**: `quick`

- [ ] 5. Update `UploadButton` Component (`src/components/dashboard/upload-button.tsx`)

  **What to do**:
  - Remove the second `fetch('/api/extract-metadata')` call in `processFile`.
  - Extract metadata directly from the `/api/upload` response.
  - Update `uploadProgress` state transitions (skip 'extracting' step as it's now part of 'uploading').

  **Recommended Agent Profile**:
  - **Category**: `artistry`
  - **Skills**: [`react`, `frontend-ui`]

  **Acceptance Criteria**:
  - [ ] Metadata is populated in the form immediately after the upload progress completes.
  - [ ] No "extracting" state is visible if the combined call is fast enough (or update labels to "Uploading & Analyzing").

---

## Commit Strategy

| After Task | Message | Files |
|------------|---------|-------|
| 1, 2 | `feat(lib): add consolidated metadata extractor with partial parsing` | `src/lib/pdf/metadata.ts` |
| 3, 4 | `refactor(api): consolidate metadata extraction into upload endpoint` | `src/app/api/upload/route.ts`, `src/app/api/extract-metadata/route.ts` |
| 5 | `refactor(ui): update upload-button to handle consolidated response` | `src/components/dashboard/upload-button.tsx` |

---

## Success Criteria

### Verification Commands
```bash
# Check if /api/upload returns keywords
curl -X POST http://localhost:3000/api/upload -F "file=@sample.pdf" | jq '.metadata.keywords'
```
