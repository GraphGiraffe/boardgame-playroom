# Learning settings: owned confirmation and offer

The existing `learning reset is confirmed, enables learning and resets only the current pack` browser case reproduced three concrete failures in the old `app/tutorial-settings.js`:

- A real accepted reset confirmation was held before its caller resumed. Opening replacement settings for the same game made the old completion enable the new native checkbox and reset the preference.
- Holding the same completion while a child panel covered the original settings changed the suspended input/preference as well.
- Escape from child settings marked the underlying learning offer as prompted, despite closing only the child.

The runtime fix is confined to `app/tutorial-settings.js`. Reset captures its original frame, native input, profile and learning scope; its confirmation requires retained validity, and the completed action requires that same frame/input to be interactive. The learning offer owns its frame/attempt and disposal. Default acceptance occurs through that offer's own Back callback; global Escape and `.learning-intro` discovery no longer decide an unrelated surface's behavior. Choice/list events are scoped to the active root. No tutorial rules, progress-store format, global app navigation or tutorial UX was rewritten.

The same existing case now passes **Chromium 1/1 and WebKit 1/1**, with no page errors or native Supabase traffic. It uses real game-card → local game → game menu/settings, real confirmation Cancel/Accept and the existing safe-provider boundary. A test-only wrapper delays delivery of the real confirmation result; it does not fabricate acceptance. Ordinary confirmed reset still enables learning, cancellation leaves it disabled, and the other pack's setting is preserved. Replacement/suspended completions leave both preferences and inputs unchanged; Back retains the original native input and a child Escape leaves the offer undecided.

Command: `node scripts/codex/test.cjs case/rc2-presentation-browser --name 'learning reset is confirmed'` (the second run uses the existing WebKit launcher environment). Syntax and diff checks pass. Evidence: workspace `tmp_files/ux-021/tutorial-ownership/{ownership-red,chromium,webkit}.log` and `source.sha256`. An initial test child omitted its explicit return token; that fixture was corrected before recording the aggregate red above. No production or provider action was performed.
