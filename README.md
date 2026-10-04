# OphthaCheck v0.5

Zero-cost proof-of-concept for AI-assisted ophthalmic nursing workflow.

## Voice workflow
1. Deploy/open `index.html` from an HTTPS web address.
2. Open it directly in Chrome.
3. Tap **Start dictation**.
4. Allow microphone permission.
5. Speak naturally.
6. Tap **Stop**.
7. Tap **Parse into fields**.
8. Review and correct every field before running OphthaCheck.

### Why the earlier HTML failed
The Web Speech API was present, but the local `file://` preview can be blocked by browser security. v0.5 detects this and tells the user to use HTTPS. It also requests microphone permission before starting speech recognition.

## Free hosting
GitHub Pages can host this single `index.html` at an HTTPS URL. Create a repository, upload `index.html`, enable Pages from the main branch/root, then open the generated HTTPS URL in Chrome.

## Safety
Use synthetic cases only. Do not enter identifiable patient information into browser speech services or external AI systems unless approved for clinical use by the relevant institution. This prototype is not a diagnostic or treatment system.
