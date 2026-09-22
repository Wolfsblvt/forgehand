# Message authoring

## Meaning

This guide owns Forgehand's public message contract: built-in fallback copy and repository replacements say what happened, what happens next, and how a reader can recover. It does not select a repository's lifecycle policy or authorize an outward effect.

Templates are whole repository-owned messages. A repository may change their rhythm, vocabulary, and warmth, but it keeps the action, deadline, consequence, and recovery meaning intact.

1. Write directly and quietly. Say what happened, what happens next, and what the reader can do.
2. Stay factual. Do not use Forgehand roleplay, faux empathy, scolding, threats, status-page prose, or bot bureaucracy.
3. Keep internal doctrine internal. Maintainer controls and timer implementation do not belong in contributor-facing copy unless a reader needs them to act.
4. Make recovery literal. A closure says whether and how reopening is available without suggesting the report was false, rejected, or fixed.
5. Use GitHub's native rendering. Keep plain PR URLs and full commit SHAs in the message rather than wrapping them in custom Markdown.
6. Do not lecture contributors about `Keep Open`; that is a maintainer control, not an inactivity warning.
7. A received necessary response is silent by default. The waiting state ends without an automatic semantic commentary.
8. Ask for clear, relevant, reproducible information. `smallest` is not a ritual adjective.

The generated product packet places its templates in `.github/automation/messages/`. Its managed diffdevil XL template is repository-authored, while the managed App independently owns evaluation, transition identity, and comment lifecycle.
