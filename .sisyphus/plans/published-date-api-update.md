# Add PublishedDate Field to Extract-Metadata API

## TL;DR

> **Quick Summary**: Update the extract-metadata API to include a `publishedDate` field in all responses. The field will extract year-month (YYYY-MM) format from AI analysis, with a simplified regex fallback for traditional extraction. Empty string returned if no date found.

> **Deliverables**:
> - Modified `src/app/api/extract-metadata/route.ts` with publishedDate support
> - AI prompt updated to request publishedDate in YYYY-MM format
> - Regex extraction added to extractWithRegex function
> - All 4 response paths include publishedDate field

> **Estimated Effort**: Short
> **Parallel Execution**: NO - sequential file changes
> **Critical Path**: AI Prompt Update → Response Updates → Regex Addition

---

## Context

### Original Request
- Database has `published_date` field (format: YYYY-MM or YYYY)
- Frontend components use `publishedDate` state
- Previously removed publishedDate from API due to reliability issues
- User wants simplified approach: year-month only (YYYY-MM), return empty if cannot extract

### Interview Summary
**Key Discussions**:
- **Date format**: Confirmed YYYY-MM or YYYY only, no day component
- **Reliability**: Previous attempts failed due to full date parsing complexity
- **New approach**: Simplify to year-month with empty string fallback
- **AI strategy**: Ask for YYYY-MM format, or just year if month unknown

**Research Findings**:
- **Current state**: publishedDate completely removed from API (line 55 comment confirms this)
- **No tests**: No existing test files for this route
- **Consistent pattern**: All responses use NextResponse.json with title, authors, keywords, journal
- **File location**: `/src/app/api/extract-metadata/route.ts` (210 lines total)

---

## Work Objectives

### Core Objective
Add `publishedDate` field back to the extract-metadata API with simplified year-month extraction, ensuring the field exists in all response types (success, fallback, error) with empty string fallback.

### Concrete Deliverables
- Modified `src/app/api/extract-metadata/route.ts`
- Updated AI prompt requesting publishedDate in YYYY-MM format
- Regex extraction logic in extractWithRegex function
- 4 response paths updated to include publishedDate field

### Definition of Done
- [ ] `npm run build` completes successfully
- [ ] API returns publishedDate field in all response paths
- [ ] AI prompt successfully requests and parses publishedDate
- [ ] Fallback regex extracts YYYY or YYYY-MM patterns
- [ ] Empty string returned when no date found

### Must Have
- publishedDate field in all 4 response paths
- AI prompt modification with clear format guidance
- Regex fallback for traditional extraction
- Build success without errors

### Must NOT Have (Guardrails)
- No day-level date parsing (keep it simple)
- No database changes (field already exists)
- No frontend modifications (already uses publishedDate state)
- No test file creation (not requested)
- No breaking changes to existing response structure

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (no test files found for this route)
- **User wants tests**: NO (not mentioned in requirements)
- **Framework**: N/A - Manual verification only

### Manual Verification Procedures

**For API endpoint changes**:
```bash
# Build the project
npm run build

# Verify build success
# Expected: "○ (Static) prerendered, but not emitted ("build" command)
#           or similar success message
```

**For response structure verification**:
```bash
# Start development server
npm run dev &

# Test with a PDF file using curl
curl -X POST -F "file=@test.pdf" http://localhost:3000/api/extract-metadata | jq .

# Verify response includes publishedDate field (can be empty string)
# Expected JSON structure:
# {
#   "title": "...",
#   "authors": "...",
#   "keywords": "...",
#   "journal": "...",
#   "publishedDate": ""  // or "2024-03" if found
# }
```

**For fallback regex testing**:
```bash
# Test regex pattern directly
echo "Published: 2024-03-15" | grep -oE '\b(19|20)\d{2}[-/]\d{2}\b'
# Expected: "2024-03"

echo "Year 2023" | grep -oE '\b(19|20)\d{2}\b'
# Expected: "2023"
```

---

## Execution Strategy

### Sequential Execution
All tasks are interdependent and must be performed sequentially:
1. Update AI prompt to request publishedDate
2. Update AI success response parsing
3. Update extractWithRegex function (regex + return statement)
4. Update short text fallback response
5. Update error response

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1. AI Prompt Update | None | 2 | None (sequential) |
| 2. AI Response Update | 1 | 3 | None |
| 3. extractWithRegex Update | 2 | 4, 5 | None |
| 4. Fallback Response Update | 3 | None | None |
| 5. Error Response Update | 3 | None | None |

---

## Tasks

### Task 1: Update AI Prompt to Request PublishedDate

**What to do**:
- Modify lines 66-87 in `/src/app/api/extract-metadata/route.ts`
- Add `publishedDate` field to the JSON template
- Add extraction rule for publishedDate

**Must NOT do**:
- Don't change existing field extractions
- Don't modify AI model settings or temperature
- Don't add complex date parsing logic

**Delegation Recommendation**:
- Category: `quick` - Simple text modification, no complex reasoning
- Skills: [] - No special skills needed, basic TypeScript editing

**Skills Evaluation**:
- OMITTED `typescript-programmer`: Domain is simple string editing, not complex logic
- OMITTED `git-master`: No git operations needed for this small change

**Depends On**: None (can start immediately)

**Acceptance Criteria**:
- [ ] AI prompt JSON template includes `"publishedDate": "发表日期，格式 YYYY-MM（如 2024-03），如果只知道年份则只填年份"`
- [ ] Extraction rules include date extraction guidance
- [ ] No other prompt changes made

**References**:
- `src/app/api/extract-metadata/route.ts:66-87` - Current AI prompt (modify this)

---

### Task 2: Update AI Success Response Parsing

**What to do**:
- Modify lines 122-127 in `/src/app/api/extract-metadata/route.ts`
- Add `publishedDate: parsed.publishedDate || ''` to the response object
- Ensure publishedDate is extracted from parsed AI response

**Must NOT do**:
- Don't remove or modify existing fields
- Don't change response structure beyond adding publishedDate

**Delegation Recommendation**:
- Category: `quick` - Simple object property addition
- Skills: [] - No special skills needed

**Skills Evaluation**:
- OMITTED `typescript-programmer`: Trivial property addition
- OMITTED `git-master`: No git operations needed

**Depends On**: Task 1 (AI prompt must request the field first)

**Acceptance Criteria**:
- [ ] Response object includes `publishedDate: parsed.publishedDate || ''`
- [ ] Returns empty string if AI doesn't provide publishedDate
- [ ] Line numbers match: 122-127 area

**References**:
- `src/app/api/extract-metadata/route.ts:122-127` - Current success response (modify this)
- `src/app/api/extract-metadata/route.ts:100-118` - AI response parsing logic (context)

---

### Task 3: Add PublishedDate Extraction to extractWithRegex Function

**What to do**:
- Add publishedDate extraction logic to `extractWithRegex` function (around line 155-200)
- Use simplified regex pattern: `\b(19|20)\d{2}[-\/]\d{2}\b|\b(19|20)\d{2}\b`
- Update the function return statement to include publishedDate

**Must NOT do**:
- Don't over-engineer the regex (no complex date formats)
- Don't modify other extraction logic in the function
- Don't change function signature or parameters

**Delegation Recommendation**:
- Category: `quick` - Simple regex pattern and property addition
- Skills: [] - No special skills needed

**Skills Evaluation**:
- OMITTED `typescript-programmer`: Simple regex addition
- OMITTED `git-master`: No git operations needed

**Depends On**: Task 2 (response structure update)

**Acceptance Criteria**:
- [ ] Regex pattern `\b(19|20)\d{2}[-\/]\d{2}\b|\b(19|20)\d{2}\b` added
- [ ] Pattern matches YYYY-MM, YYYY/MM, and YYYY formats
- [ ] PublishedDate variable declared and assigned
- [ ] Return statement updated to include `publishedDate`
- [ ] Line numbers: around 155-208 area

**References**:
- `src/app/api/extract-metadata/route.ts:150-209` - extractWithRegex function (modify this)
- `src/app/api/extract-metadata/route.ts:203-208` - Current return statement (modify this)

---

### Task 4: Update Short Text Fallback Response

**What to do**:
- Modify lines 50-57 in `/src/app/api/extract-metadata/route.ts`
- Add `publishedDate: ''` to the short text fallback response
- This handles cases where PDF text is too short (< 200 characters)

**Must NOT do**:
- Don't modify other fields in this response
- Don't change the short text detection logic

**Delegation Recommendation**:
- Category: `quick` - Simple property addition
- Skills: [] - No special skills needed

**Skills Evaluation**:
- OMITTED `typescript-programmer`: Trivial property addition
- OMITTED `git-master`: No git operations needed

**Depends On**: Task 3 (consistent field addition pattern)

**Acceptance Criteria**:
- [ ] Response object includes `publishedDate: ''`
- [ ] Response still returns all other fields correctly
- [ ] Line numbers match: 50-57 area

**References**:
- `src/app/api/extract-metadata/route.ts:50-57` - Current short text fallback (modify this)

---

### Task 5: Update Error Response

**What to do**:
- Modify lines 140-145 in `/src/app/api/extract-metadata/route.ts`
- Add `publishedDate: ''` to the error response object
- This ensures all error responses also include the field

**Must NOT do**:
- Don't change error message or status code
- Don't modify other error handling logic

**Delegation Recommendation**:
- Category: `quick` - Simple property addition
- Skills: [] - No special skills needed

**Skills Evaluation**:
- OMITTED `typescript-programmer`: Trivial property addition
- OMITTED `git-master`: No git operations needed

**Depends On**: Task 3 (consistent field addition pattern)

**Acceptance Criteria**:
- [ ] Error response includes `publishedDate: ''`
- [ ] Status code remains 200 (per existing pattern)
- [ ] Line numbers match: 140-145 area

**References**:
- `src/app/api/extract-metadata/route.ts:140-145` - Current error response (modify this)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| All 5 | `feat(api): add publishedDate field to extract-metadata` | `src/app/api/extract-metadata/route.ts` | `npm run build` |

---

## Success Criteria

### Verification Commands
```bash
# 1. Build the project
npm run build

# Expected: Build completes without errors

# 2. Verify file changes (optional manual check)
grep -n "publishedDate" src/app/api/extract-metadata/route.ts

# Expected output showing publishedDate in:
# - AI prompt (requesting the field)
# - AI success response (parsing the field)
# - extractWithRegex (regex extraction)
# - Fallback response (empty string)
# - Error response (empty string)
```

### Final Checklist
- [ ] All "Must Have" present (publishedDate in all responses)
- [ ] All "Must NOT Have" absent (no day parsing, no frontend changes)
- [ ] Build succeeds without errors
- [ ] Regex pattern correctly extracts YYYY and YYYY-MM formats
- [ ] Empty string returned when no date found
- [ ] No breaking changes to existing response structure

---

## Summary of Changes

### Line Reference Map

| Location | Change Type | Description |
|----------|-------------|-------------|
| Lines 50-57 | ADD FIELD | publishedDate: '' to short text fallback |
| Lines 66-87 | MODIFY | Add publishedDate to AI prompt JSON template and rules |
| Lines 122-127 | ADD FIELD | publishedDate: parsed.publishedDate \|\| '' to AI success |
| Lines 140-145 | ADD FIELD | publishedDate: '' to error response |
| Lines 155-200 | ADD LOGIC | Regex extraction pattern in extractWithRegex |
| Lines 203-208 | MODIFY | Add publishedDate to extractWithRegex return |

### Response Structure (All 4 Paths)

```typescript
// All responses now include:
{
  title: string,
  authors: string,
  keywords: string,
  journal: string,
  publishedDate: string  // YYYY-MM, YYYY, or ''
}
```

### AI Prompt Addition

```json
{
  "title": "...",
  "authors": "...",
  "journal": "...",
  "keywords": "...",
  "publishedDate": "发表日期，格式 YYYY-MM（如 2024-03），如果只知道年份则只填年份"
}
```

### Regex Pattern

```typescript
const datePattern = /\b(19|20)\d{2}[-\/]\d{2}\b|\b(19|20)\d{2}\b/
// Matches: 2024-03, 2024/03, 2024, 1999
```
