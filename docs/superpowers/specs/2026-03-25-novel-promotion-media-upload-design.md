# Novel Promotion Media Upload Design

## Summary

Unify the user-facing media workflow across the asset center, project asset library, storyboard, and voice stages so users can upload media directly instead of being forced into AI-only generation flows. This work should follow a minimum-change strategy: keep the current storage models for characters, locations, panels, and voice lines, but align the product behavior, form logic, upload entry points, and prompt-preview experience.

## Goals

- Let users upload result media directly where they currently can only generate from AI.
- Merge text-to-image and image-to-image into one creation/editing form for character and location assets.
- Keep asset center and project asset library behavior consistent after an asset exists, while preserving separate data scopes.
- Add storyboard image/video upload alongside existing generation flows.
- Surface the final composed prompt in storyboard editing so users can inspect and copy what the model actually receives.
- Treat narration as a normal speaker in the voice stage.

## Non-Goals

- Full schema unification between character and location candidate-image storage.
- Refactoring all media resources into a new cross-domain asset system.
- Changing existing result-media fields such as `imageUrl`, `imageUrls`, `selectedIndex`, `selectedImageId`, `videoUrl`, or `audioUrl`.
- Reworking unrelated AI generation quality or prompt-engineering behavior.

## Product Principles

- Keep product semantics unified even when current storage differs underneath.
- Prefer additive changes over risky storage rewrites.
- Preserve the user's ability to save an asset before it has any result media.
- Distinguish clearly between reference media and result media.
- Make upload and generation coexist instead of forcing users to choose one permanent mode up front.

## Scope

This design covers:

- Asset center character and location creation/editing
- Project asset library character and location creation/editing
- Storyboard panel image upload
- Storyboard panel video upload
- Storyboard final prompt preview and copy
- Voice stage narration speaker support

## Current Model Constraints

The current repository stores character and location candidate images differently:

- Characters use `imageUrls` plus `selectedIndex`, with `imageUrl` representing the current result.
- Locations use `LocationImage` or `GlobalLocationImage` records plus `selectedImageId` or `isSelected`.

These storage differences should remain in place for this phase. The UI and business rules should be normalized through adapters instead of schema unification.

## Design Overview

### 1. Unified Asset Form Semantics

Character and location creation/editing should use one form model for generation inputs:

- name
- profile or summary text
- image description prompt
- optional AI-assisted prompt extraction or rewrite
- optional reference image upload
- optional direct result image upload

The form should no longer present text-to-image and image-to-image as two separate modes. Instead:

- if reference images exist, generation behaves as image-to-image
- if reference images do not exist, generation behaves as text-to-image

Reference images are generation inputs. Result images are candidate outputs. They are not the same concept and should not share product treatment beyond both involving file upload.

### 2. Asset Creation and Empty Assets

New asset creation should continue supporting an asset with no result image yet.

- Users may save a character or location with text fields only.
- Users may save after adding reference images without immediately generating.
- Users may upload a result image during creation.
- Users may create and generate in one action.

This keeps the current workflow where an asset can exist before its final media exists.

### 3. Asset Center and Project Asset Library Relationship

Asset center and project asset library should share the same media capabilities and form semantics, but they must keep separate persistence targets:

- asset center writes to global asset data
- project asset library writes to project-scoped asset data

This is a behavior unification, not a data merge. Project assets should not be silently written back into the asset center.

## Candidate Images and Result Selection

### Product Semantics

For both characters and locations, the product should consistently think in terms of:

- candidate image list
- current selected result image

Selection means choosing which candidate is currently the result. The storage implementation may differ, but the user-facing behavior should be the same.

### Field Mapping

Current character mapping:

- candidate list: `imageUrls`
- current result: `imageUrl`
- selection marker: `selectedIndex`
- rollback snapshot: `previousImageUrl`, `previousImageUrls`

Current location mapping:

- candidate list: `LocationImage[]` or `GlobalLocationImage[]`
- current result: selected image record's `imageUrl`
- selection marker: `selectedImageId` and `isSelected`
- rollback snapshot: per-image `previousImageUrl`

## Upload, Generate, Select, and Undo Rules

### Selection

- Selecting a candidate image only changes the current result pointer.
- Selection does not mutate the candidate list.
- Selection does not create a new undo snapshot.

### Result Image Upload

Result image upload should be treated as adding a new candidate image, then selecting it immediately as the current result.

That means:

- for characters, append a new entry to `imageUrls`, then point `selectedIndex` to it and update `imageUrl`
- for locations, create a new `LocationImage` record, then set it selected via `selectedImageId` or `isSelected`

This rule replaces any product expectation that upload "overwrites a slot." It makes the behavior easier to reason about and simplifies undo.

### Regeneration

Regeneration remains a result-media-changing action. Whether the current implementation replaces or appends candidates internally, the user-facing rule is:

- regeneration produces new candidate output
- regeneration updates the current result
- regeneration creates an undo snapshot

### Reference Image Upload

Reference image upload is not part of the candidate-result-selection chain.

- it does not change the current result
- it does not modify the result candidate list
- it does not participate in result undo
- it only affects future generation requests

## Reference Image Persistence

Reference images uploaded during creation and reference images uploaded later during editing should represent the same persisted asset-level generation input for that editing unit.

For this phase, use the current structure with minimal change:

- character reference images attach to `CharacterAppearance` or `GlobalCharacterAppearance`
- location reference images attach to `LocationImage` or `GlobalLocationImage`

This is an implementation compromise, not a statement that character and location product semantics are different. It lets the app preserve generation context for the currently edited result unit without redesigning the whole asset storage model.

## Asset Editing Behavior

After an asset exists, the asset center and project asset library should expose the same core operations:

- upload result image
- regenerate image
- edit image
- manage reference images for future generation
- preview current result
- choose a different candidate result

The exact buttons can still vary slightly by local screen layout, but the capability set should match.

## Storyboard Design

### Panel Image Upload

Storyboard panels should support direct image upload, including drag-and-drop in the panel card area.

- Upload writes to the existing `panel.imageUrl`
- Upload should coexist with AI generation
- If a panel already has image output, uploading a new image replaces the current panel result media in the panel domain

### Panel Video Upload

Storyboard panels should support direct video upload.

- Upload writes to the existing `panel.videoUrl`
- Upload should coexist with AI video generation
- Existing rendering that already prefers `videoUrl` over `imageUrl` should remain in place

### Final Prompt Preview

The panel editing or AI-data modal should show the final composed prompt sent to the model, not only raw user-entered fragments.

This preview should include the assembled values derived from:

- shot type
- camera move
- location or scene
- characters
- visual description
- photography rules
- acting notes
- image or video prompt text

The modal should provide one-click copy for that final composed prompt.

## Voice Stage Design

Narration should be handled as a normal speaker named `旁白`.

- narration should appear in the speaker binding UI
- narration should allow voice assignment just like other speakers
- narration lines should generate, preview, and play back through the same line-audio flow

This approach avoids introducing a separate narration-only media model and matches the existing speaker-string-based binding architecture.

## Error Handling

- Upload failures should behave like current media-upload failures in the app, with the same alert or error presentation patterns already used in adjacent flows.
- Direct upload should not silently erase the previously selected result if the upload fails.
- Final prompt preview should degrade gracefully if some optional prompt fragments are empty.
- Narration should not require a backing character record; validation should treat speaker name as sufficient.

## Testing Strategy

Add focused tests around the minimum-change behavior:

- character creation and location creation can still save without result media
- unified asset form switches generation behavior based on whether reference images exist
- result image upload adds a new candidate and makes it current
- candidate selection changes the current result without creating undo state
- undo after result upload or regeneration restores the previous current result state
- storyboard panel image upload updates `panel.imageUrl`
- storyboard panel video upload updates `panel.videoUrl`
- final prompt preview renders and copies the composed prompt
- narration appears as a normal speaker and can bind a voice

Tests should follow the current repository's existing API and UI patterns rather than inventing a new test harness.

## Acceptance Criteria

- Character and location creation/editing use one generation form model instead of separate text and reference modes.
- New assets can still be saved without result media.
- Result image upload is available in asset center and project asset library.
- Result image upload creates a new candidate result and selects it immediately.
- Reference image upload exists as generation input in both creation and editing.
- Asset center and project asset library expose the same post-creation media capabilities.
- Storyboard panels support image upload and video upload.
- Storyboard editing shows the final composed prompt and supports copy.
- Narration is treated as a normal speaker named `旁白` in the voice workflow.
