# Windows v0.2.0 QA — 2026-11-20

## Test Summary

Published source/tag: `5995c32ee00415fd8b23f43146784ff6b87cf67a` / `v0.2.0`.
The installed application reports FileVersion and ProductVersion **0.2.0**.
Local OS: **Windows 11 Pro x64, 10.0.26200**; WebView2 **157.0.4341.60**;
Node **24.15.0**. Executable SHA-256:
`cadf3a4c12f3534fe02fda18f71ee341428f5efafc9ca3d39506f917a031d68d`.
This executable hash is an identity observation, not proof that it matches the
release installer; that binary-to-installer comparison was not performed.

The published baseline passed 60 existing unit tests, TypeScript and production
Angular build locally. Expanded baseline regressions reproduced defects below.
The corrected source passed **76 browser E2E tests**, with no skips or retries,
using an isolated Chrome profile and a real HTTP fixture bound to 127.0.0.1:4311.
Desktop-vault browser tests simulate IPC: they are **not native DPAPI evidence**.
The expanded unit suite contains **65 tests**. The PR's required CI checks are
the authoritative final-commit results, including genuine installed MSI/WebView2
acceptance on a disposable Windows runner; do not infer native success from
browser results. The final GitHub QA report records exact tested SHAs and run URLs.

Earlier environment-only attempts could not start tests because the bundled
Playwright browser was absent, and browser download returned regional HTTP 403.
Using `API_STUDIO_BROWSER_CHANNEL=chrome` with a fresh automated profile and
installing Playwright's FFmpeg dependency resolved this. These attempts are
Blocked infrastructure runs, not application failures or successful tests.
The default CI still uses its downloaded Chromium. Dependencies were installed
fresh; no lockfile is introduced by this QA patch.

## Feature Coverage

Statuses below describe the **local evidence**. `CI gate` means implemented native
acceptance whose executed outcome must be checked in the linked PR checks. A
browser reload is not an OS-process restart. All fixture tokens and payloads are
synthetic. No production banking requests, personal exports or existing vaults
were used for this mission.

| Area / scenario | Local status | Method and evidence / limit |
| --- | --- | --- |
| Installed executable, version, process | Passed | File metadata/hash; live native window |
| WebView2/Tauri startup | Passed, limited | Running native process and child WebView2; not a clean-install test |
| Help/About layout, installed/latest version | Passed | Actual installed Windows UI |
| Source, README, Persian, changelog, license, issue links | Passed, limited | Native accessibility tree href inspection; source docs read; OS-browser launch not tested locally |
| Manual update check; startup up-to-date status | Passed | Installed UI, official v0.2.0 result |
| Stable/prerelease/draft sorting and malicious release URL | Passed | Release-catalog unit tests and Help/About browser E2E with controlled metadata |
| Offline update errors / newer-version banner | Passed | Browser controlled release endpoint; not an OS network-disconnection test |
| New request, rename, duplicate | Passed | Browser request-tabs and workflow tests; native CI folder/tab acceptance |
| Three independent saved tabs, reload restoration | Passed | Browser E2E; real native process restart is a CI gate |
| Per-tab drafts, response view and response isolation | Passed | Browser tabs and real HTTP sequential responses |
| Unsaved indicator, Save/Discard/Keep editing | Passed | Browser safe-close dialogs, saved request reopening |
| Keyboard new/save/send/close | Passed | Actual keyboard events in browser E2E |
| Twelve-tab limit | Passed | 12 drafts retained; 13th rejected with feedback |
| Concurrent requests across tabs | Known limitation | v0.2.0 explicitly serializes execution and blocks switching/opening/closing during a request; real HTTP E2E verifies this |
| Collections create/delete, request moves | Partial | Browser create/move passed; native destructive collection deletion not tested locally |
| Nested folders, moving Collections | Passed | Folder unit tests, browser reload; native CI gate |
| Filter; expand/collapse; sidebar resize/compact | Passed | Sidebar browser E2E, preference unit tests; existing native CI coverage |
| Collection/environment/request capacity | Passed | Unit parser guards and browser collection-capacity rejection; 2,000 saved requests plus History parse without loss |
| GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS | Passed | Real localhost browser HTTP, all seven methods; native HTTP CI gate |
| Query parameters and environments | Passed | Real HTTP echo + existing environment substitution E2E |
| JSON, text, URL-encoded and text multipart bodies | Passed | Real HTTP echo, content types and multipart boundary assertions |
| Bearer / Basic auth, headers | Passed | Real HTTP echo using fake credentials; history checked for absence of auth secrets |
| Invalid URL/JSON/missing variables | Passed | Validation unit tests and browser no-outgoing-request assertions |
| 2xx/304/4xx/5xx and 302 redirect | Passed | Real fixture status endpoints and redirect to echo |
| Cancel, retry, Loading | Passed | Real delayed response; cancellation then successful request |
| 30-second timeout | Passed | Real 35-second delayed endpoint; transport timeout assertion |
| Connection refused / DNS / TLS classification | Partial | Local refused connection E2E; DNS/TLS unit classification only; native DNS/TLS fault injection not tested |
| Response status, headers, bytes | Passed | Echo/browser tests; earlier installed sample showed 200, 83 B, 22 headers |
| Response elapsed duration | Fixed | 700 ms streamed body previously reported 16 ms; real browser regression now includes body download; native CI gate |
| JSON/XML/HTML Raw and Formatted | Passed | Real localhost content-type payload matrix plus unit formatting |
| Text, empty 204/304, invalid JSON | Passed | Real HTTP fixtures; malformed JSON preserved as text |
| Binary response | Partial | Classifier unit test; full binary download unsupported by product |
| Copy, response download | Passed, limited | Browser clipboard reads full 600,000-char payload; existing browser download test checks filename; OS save dialog/file contents not verified locally |
| Large preview (500,000 chars) | Passed | Real 600,000-char response; bounded preview/full clipboard |
| 5 MB transport limit diagnostic | Fixed | Real 5 MB + 1 Content-Length response; clear message retained; binary export remains disabled |
| HTML/JavaScript injection | Passed | Real markup displayed as text; no script execution or image request; native CI gate |
| Postman v2.0 / v2.1 nested Collections | Passed | Additive browser imports, reload; installed WebView2 file-input CI gate |
| Postman Environment | Passed | Browser import/reload then real variable-resolved HTTP; native file-input CI gate |
| API Studio restore and cancel | Passed | Existing restore-cancel E2E + native backup parser unit tests |
| Invalid/malicious import | Passed | Invalid JSON, cycles, excessive depth/capacity, duplicate saved identities fail closed; scripts are never executed |
| Repeated Postman import | Known behavior | Imports are additive with fresh IDs; intentional repeated imports can create extra Collections; no deduplication promise |
| Native Windows OS file picker | Not Tested locally | Automated WebView2 setInputFiles does not prove the OS picker; follow-up #9 remains open |
| Export/restore roundtrip | Partial | Workspace/folder unit roundtrip; actual OS export file roundtrip not tested locally |
| History persistence/redaction | Passed | Browser HTTP/privacy tests, unit sanitization; native migration/restart CI gate |
| History records sent snapshot | Fixed | Reproduced baseline storing `/never-sent` instead of `/delay`; corrected HTTP E2E passes |
| Windows CurrentUser DPAPI / no-password startup | CI gate | Real installed-MSI CI migration/restart assertions; local installed storage indicator alone is not cryptographic evidence |
| Optional passphrase/wrong password/persistent choice | CI gate | Existing disposable installed WebView2 acceptance; browser IPC simulation and AES-GCM unit tests separately pass |
| Save failure and migration rollback | Passed, simulated only | Browser IPC failure injection; no local disk/ACL fault injection against user vault |
| Real v0.1.2-generated encrypted vault migration | Not Tested | Existing CI seeds a legacy fixture, not a vault created by actual v0.1.2 binary; #9 remains open |
| Corrupt primary / backup recovery / interrupted native writes | Not Tested end-to-end | Storage code inspected; real Windows fault injection remains outstanding |
| Secrets in storage/logs | Partial | Unit redaction/encryption + browser localStorage assertions; no comprehensive OS log/memory forensic audit |
| Native restart, install/uninstall, multi-launch | CI gate / Partial | Existing CI installed-process restart/install/uninstall; multiple concurrent native instances not tested locally |
| Responsive layout, long text, scroll, icons | Passed, sampled | Mobile overflow/sidebar browser tests and live installed screenshot; exhaustive DPI/multimonitor visual review not performed |
| Focus/accessibility/keyboard navigation | Partial | Semantic browser locators, keyboard shortcuts, splitter tests; no full screen-reader or modal focus-trap audit |
| Native project URL allowlist | CI gate + reviewed | Existing installed native unsafe-URL rejection; fixed native allowlist inspected |

## Bug Report

| Issue | Severity | Reproduction and root cause | Correction / retest |
| --- | --- | --- | --- |
| [#15](https://github.com/mehrdadbahrainy/api-studio/issues/15) | P1 | Restore 151 Collections / 81 environments: array slicing silently drops entries; duplicate saved IDs accepted. At 2,000 saved requests History also incorrectly consumed request capacity. | Reject invalid capacity/identity input before restore; enforce interactive creation limits; count saved requests separately from bounded History. Unit and browser preservation regressions. |
| [#16](https://github.com/mehrdadbahrainy/api-studio/issues/16) | P2 | Flush response headers, finish body after 700 ms: UI reports 16 ms. Timer measured before body read. | Measure after consumption; real HTTP browser regression and installed native CI assertion. |
| [#17](https://github.com/mehrdadbahrainy/api-studio/issues/17) | P2 | Send 5 MB + 1 response: generic binary text hides preview-limit message and suggests disabled Save. | Preserve transport diagnostic; unit + real HTTP browser regression; installed native CI assertion. |
| [#18](https://github.com/mehrdadbahrainy/api-studio/issues/18) | P2 | Send `/delay`, edit URL to `/never-sent`: wrong URL enters History after await. | Capture independent sent draft before transport; use it in both success/failure paths; baseline failure and fixed browser regression. |

Two pre-existing browser tests also assumed Angular's newly created tab form
had already received its initial model value. Current Chrome reproduced an
appended request name. The tests now wait for the visible initial `Untitled
request` value before replacing it, matching the native acceptance synchronization.
This is recorded as test synchronization, not an unverified application fix.

## Regression & Security

The existing personal Windows workspace was left in place. The earlier introductory
sample GET (before this comprehensive mission) added one History entry; that is
not part of the isolated localhost test matrix and no financial requests ran.
Native migration/security/import acceptance is restricted to an explicitly
disposable GitHub Actions runner and refuses personal-profile execution. A
separate WebView2 data folder by itself does **not** isolate native DPAPI storage:
`app_local_data_dir()` still uses the application identifier. Do not run the
native acceptance script against a user's installed app on their personal profile.

Windows build/runtime checks must execute before merge; compiler availability
and a disposable local native profile were not available on this machine.
Source inspection and mocked IPC results are never counted as native passes.
No MSI was reinstalled over the user's current installation. No security settings,
tokens, personal vault contents or production credentials are published here.

## GitHub Changes and Release Readiness

Issues #15–#18 track the confirmed defects. See the fixing PR and its Checks for
the exact patch SHA, unit/build/browser gates and installed Windows MSI results.
Baseline release CI: [44500230376](https://github.com/mehrdadbahrainy/api-studio/actions/runs/44500230376).
Baseline publication: [44501517577](https://github.com/mehrdadbahrainy/api-studio/actions/runs/44501517577).
Those historical passes are not counted as execution of this patch's new tests.

**Published v0.2.0: Not Ready for an unqualified quality sign-off**, because the
above defects were reproduced. The source patch may be classified **Ready with
Known Limitations** only after its exact commit passes all CI gates. Native OS
picker, real-v0.1.2 migration and fault-injected backup recovery remain explicitly
outstanding. Passing source CI does not update the already installed binary.
Do not replace v0.2.0 release assets or publish a patched release without the
owner's separate explicit approval.
