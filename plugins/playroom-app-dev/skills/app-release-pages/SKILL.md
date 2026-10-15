---
name: app-release-pages
description: Publish PlayRoom app releases to the existing protected Pages project and verify independent app versus R2 pack publication.
---

# Independent app release and Pages deployment

Read live RELEASING and the independent-publication sections of current Pages documents and actual workflow inputs. Use [workflow](../../references/WORKFLOW.md) for explicit checks, immutable provenance and existing authorization. Release checks require a selected list or none; never silently substitute full tests. Build/hash verification remains mandatory.

App production deploy uses the existing prerelease.yml gateway/project and published release assets. Pack files/catalog are independently published by the packs workflow through private R2/PLAYROOM_PACKS and the app route; a pack-only update does not require an app deployment. Inspect current bindings, publisher inputs and selected release SHAs. Preserve protected access, Git integration and disabled automatic previews; previews require an actual request.

Verify public downloaded artifacts/checksums, exact app version/commit/project/deployment and deploy-report status. Verify a pack-only change at catalog/file endpoints and retain rollback provenance. Do not confuse a green build, GitHub Release and production publication.

Keep private worker/routes/access kits/secrets out of public assets. Use the existing local deployment fallback only with matching public ZIP, hashes, private wrapper and release-info; inspect installed --help before using arguments. No repeated Actions or unrequested background monitoring. A plugin update does not deploy the app. Read [tools](../../references/TOOLS.md) for read-only inspection/verification support.
