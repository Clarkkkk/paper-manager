# Draft: Paper Upload and Metadata Extraction Optimization

## Requirements (confirmed)
- Optimize upload and metadata extraction speed.
- Refactor `/api/upload/route.ts` to include metadata extraction.
- Limit PDF parsing to the first 3 pages.
- Consolidated response (file URL + metadata).
- Update frontend to handle the new response and remove redundant API call.
- Ensure `refineMetadataWithAI` always extracts keywords.

## Technical Decisions
- **Shared Logic**: Extract metadata extraction logic into `src/lib/pdf/metadata-extractor.ts`.
- **PDF Parsing**: Use `getDocumentProxy` and manually extract text from pages 1-3 to avoid full file processing.
- **AI Prompt**: Update `refineMetadataWithAI` to ensure keywords are always returned in the JSON response.
- **API Consolidation**: `/api/upload` will now return:
  ```json
  {
    "file_url": "...",
    "metadata": { "title": "...", "authors": "...", "journal": "...", "keywords": "..." },
    "_debug": { ... }
  }
  ```

## Research Findings
- Current extraction uses `unpdf`'s `extractText` with `mergePages: true`, which is slow for large files.
- Metadata extraction is currently a separate step causing redundant S3/Supabase IO.
- `refineMetadataWithAI` already has a JSON prompt for title, authors, journal, and keywords.

## Open Questions
- [ ] Should `/api/extract-metadata` be kept as a separate endpoint? (Recommendation: Yes, for re-runs or manual triggers, but refactor to use shared logic).
- [ ] What's the best way to limit `unpdf` to 3 pages? (Need to check `getDocumentProxy` and page iteration).

## Scope Boundaries
- **INCLUDE**: Refactoring API routes, creating shared utility, updating frontend component, optimizing AI prompt.
- **EXCLUDE**: Changing the underlying AI model, modifying Supabase storage configuration (other than path/upload logic).
