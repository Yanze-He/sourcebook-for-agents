# Pack Contributions

Pack logic lives in `apps/service-go`.

- A Pack is prepared from selected Sources without requiring any other product state.
- Desktop opens a **Send to Agent** dialog for a Pack. It must show the file/link scope, let the user make one-off prompt edits or restore the saved template, and expose a route to template settings without stacking dialogs.
- Keep source URLs when an asset is not stored locally.
- Preserve files and warnings needed to explain the selected context.
- Keep browser clipboard and file behavior explicit; never submit prompts or files to an agent automatically.

Add API coverage for Pack scope and missing local files whenever Pack behavior changes.
