# Plan: Optimized Large PDF Upload and Metadata Extraction

## TL;DR

> **Quick Summary**: Refactor the PDF upload and metadata extraction flow to handle files up to 50MB by replacing inefficient Base64 JSON with streaming Multipart/FormData and migrating to the lightweight `unpdf` library.
> 
> **Deliverables**: 
> - Refactored `upload-button.tsx` with standard multipart upload.
> - Optimized `/api/upload` route for efficient file handling.
> - New `/api/extract-metadata` logic using `unpdf`.
> - Updated route configurations for production memory/duration.
> 
> **Estimated Effort**: Short (3-4 hours)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Refactor `/api/upload` → Update UI → Update `/api/extract-metadata`

---

## Context

### Original Request
The user experiences 500 errors when uploading PDFs > 10MB. The current flow uses Base64 encoding in JSON, causing high memory usage and crashing the server.

### Interview Summary
**Key Discussions**:
- **Base64 Bloat**: Confirmed that Base64 adds ~33% overhead, pushing a 10MB file to ~14MB+ in JSON, causing `JSON.parse` to crash.
- **Double Upload/Download**: The current flow uploads to Supabase just for extraction and then uploads again for storage.
- **Library Selection**: `unpdf` is preferred for its serverless optimization and zero dependencies.

**Research Findings**:
- `unpdf` is significantly more memory-efficient than `pdf-parse`.
- Vercel/Next.js API routes have strict memory (1GB/2GB) and timeout (10s/60s) limits that 50MB PDFs will stress.

### Metis Review
**Identified Gaps** (addressed):
- **OOM Guardrails**: Added tasks to configure `maxDuration` and `memory` in route configs.
- **Error Handling**: Added checks for password-protected or text-less (scanned) PDFs.
- **Redundant Transfers**: Refactored the flow to upload **once** and pass the reference URL.

---

## Work Objectives

### Core Objective
Enable robust processing of PDF files up to 50MB by switching to a streaming-friendly multipart flow and memory-efficient parsing.

### Concrete Deliverables
- `src/components/dashboard/upload-button.tsx`: Refactored to use `FormData`.
- `src/app/api/upload/route.ts`: Optimized to handle standard `multipart/form-data`.
- `src/app/api/extract-metadata/route.ts`: Migrated to `unpdf` with memory guardrails.

### Definition of Done
- [ ] Upload 15MB PDF successfully.
- [ ] Metadata extraction (Title, Authors, Keywords) completes for 15MB PDF.
- [ ] No "Internal Server Error" (500) during the process.
- [ ] Memory usage remains within Vercel/Node.js limits.

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (Detected via search)
- **User wants tests**: Manual-only (Focus on direct verification via logs and functionality)
- **QA approach**: Manual verification with specific commands and monitoring.

### Automated Verification (Agent-Executable)

Each TODO includes EXECUTABLE verification procedures:

**For API changes** (using Bash curl):
```bash
# Verify upload route handles FormData
curl -X POST http://localhost:3000/api/upload \
  -F "file=@path/to/large.pdf" \
  -H "Cookie: [AUTH_COOKIE]"
```

**For Metadata Extraction** (using Bash curl):
```bash
# Verify metadata extraction via URL
curl -X POST http://localhost:3000/api/extract-metadata \
  -H "Content-Type: application/json" \
  -d '{"file_url": "user-id/large.pdf", "file_name": "large.pdf"}'
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation):
├── Task 1: Refactor /api/upload for efficient FormData
└── Task 2: Refactor /api/extract-metadata to use unpdf

Wave 2 (Frontend & Config):
├── Task 3: Refactor upload-button.tsx UI flow
└── Task 4: Configure Production Limits (vercel.json/next.config)
```

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1, 2 | delegate_task(category="ultrabrain", load_skills=["git-master"], run_in_background=true) |
| 2 | 3, 4 | delegate_task(category="visual-engineering", load_skills=["git-master", "frontend-ui-ux"], run_in_background=true) |

---

## TODOs

### Wave 1: Foundation (Backend Optimization)

- [ ] 1. Refactor `/api/upload` to handle `FormData` efficiently

  **What to do**:
  - Remove the JSON/Base64 branch in `src/app/api/upload/route.ts`.
  - Ensure the `multipart/form-data` branch uses `req.formData()` and handles the file stream correctly.
  - Optimize the `Buffer` creation to minimize memory spikes.
  - Return the `file_url` (path) and `signed_url` consistently.

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
    - Reason: Requires precise handling of Node.js streams and memory buffers.
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 3

  **Acceptance Criteria**:
  - [ ] `curl` upload returns `200 OK` with `file_url`.
  - [ ] File exists in Supabase Storage after upload.

- [ ] 2. Switch `/api/extract-metadata` to `unpdf`

  **What to do**:
  - Replace `pdf-parse` import with `unpdf`.
  - Refactor `processPDF` to use `getDocumentProxy` and `extractText` from `unpdf`.
  - Implement a check for password-protected PDFs (wrap in try/catch).
  - Add a fallback for scanned PDFs (if no text extracted, use filename).
  - Add `export const maxDuration = 60` to the route file.

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`
    - Reason: Deep dive into library API and performance optimization.
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 3

  **Acceptance Criteria**:
  - [ ] `curl` extraction returns JSON metadata for a known PDF URL.
  - [ ] Memory logs show stable usage during extraction.

---

### Wave 2: Integration & Production Config

- [ ] 3. Refactor `upload-button.tsx` to use standard FormData

  **What to do**:
  - Remove `if (selectedFile.size > 5 * 1024 * 1024)` check in `processFile`.
  - Standardize `processFile` to always:
    1. Upload via `FormData` to `/api/upload`.
    2. Pass the resulting `file_url` to `/api/extract-metadata`.
  - Update `handleUpload` to use the already-extracted metadata if available.
  - Improve the progress indicator (e.g., "Uploading..." -> "Extracting...").

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Requires UI/UX polish for the loading states and form handling.
  - **Skills**: [`frontend-ui-ux`, `git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: Tasks 1, 2

  **Acceptance Criteria**:
  - [ ] Selecting a 15MB file triggers progress: Uploading -> Extracting -> Done.
  - [ ] Metadata form fields auto-populate after extraction.

- [ ] 4. Configure Production Memory and Timeouts

  **What to do**:
  - Update `next.config.ts` if additional experimental flags are needed for standard API routes.
  - (If applicable) Create or update `vercel.json` to set memory to `2048` and `maxDuration` to `60` for `/api/upload` and `/api/extract-metadata`.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple configuration update.

  **Acceptance Criteria**:
  - [ ] `vercel.json` exists with correct function configs.

---

## Commit Strategy

| After Task | Message | Files |
|------------|---------|-------|
| 1 | `feat(api): optimize upload route for streaming multipart` | `src/app/api/upload/route.ts` |
| 2 | `feat(api): switch metadata extraction to unpdf for efficiency` | `src/app/api/extract-metadata/route.ts` |
| 3 | `refactor(ui): standardize upload flow to FormData` | `src/components/dashboard/upload-button.tsx` |
| 4 | `chore(config): increase production memory and timeout limits` | `next.config.ts`, `vercel.json` |

---

## Success Criteria

### Verification Commands
```bash
# 1. Test Upload (Multipart)
curl -X POST http://localhost:3000/api/upload -F "file=@test-10mb.pdf"

# 2. Test Extraction (URL-based)
curl -X POST http://localhost:3000/api/extract-metadata -H "Content-Type: application/json" -d '{"file_url": "test-path/test-10mb.pdf"}'
```

### Final Checklist
- [ ] No 500 errors for files up to 50MB.
- [ ] Metadata extraction works for both text-heavy and simple PDFs.
- [ ] Base64 logic completely removed from upload flow.
- [ ] Production memory/duration configured.
