## LAST_AGENT
Claude Sonnet 4.6

## BRANCH
fix/audio-loader-and-shaders

## LAST_COMMIT
(pending — see below)

## UPDATED
2026-05-31T07:30:00Z

## GOAL
Fix black screen on laptop/mobile and broken song upload on iOS, then confirm touch gameplay works.

## CURRENT_STATE
All three root causes identified and fixed:

1. **Black screen**: The `FluidBackgroundFilter` (FBM GLSL shader) was silently failing on
   devices where WebGL2 isn't fully available, and `game.app.stage.filters = [chromaticFilter]`
   forced the entire stage through an offscreen RenderTexture pass that would go black if the
   GLSL shader failed to compile. Fix: removed all custom GLSL shaders. Background is now pure
   PixiJS `Graphics` (dark base + per-lane colored columns that glow with the music energy).
   Miss feedback is a CSS red flash overlay (`MissFlash` class). Zero WebGL shader dependencies.

2. **Mobile upload page-refresh**: `SongLoader.pickFile()` called `fileInput.click()` from inside
   an `async` function after `await ensureAudioContext()`. iOS Safari blocks programmatic `.click()`
   on file inputs when called from an async context (loses user-gesture context). Fix: the UPLOAD
   SONG button is now a `<label for="splash-file-input">` wired to a real `<input type="file">`.
   The browser opens the native file picker directly without any JS. The `change` event emits
   `splash:fileSelected` with the `File` object; `main.ts` processes it asynchronously from there.
   The input is visually hidden via `opacity:0; width:0.1px` (NOT `display:none`, which blocks iOS).

3. **Touch gameplay**: Already implemented correctly via `InputSystem` (pointer events). Unblocked
   by fixes 1 and 2 above.

Verified in preview: splash renders, WebGL2 canvas up, FPS running, no console errors.
Mobile network URL: http://192.168.1.2:3032/

## BLOCKER
None. Need user to test on phone:
  a) Does upload open the file picker without refreshing?
  b) Do lanes/notes render (dark background + 4 colored columns + falling note circles)?
  c) Does tapping lanes in sync with the beat feel responsive?

## NEXT_STEP
If any rendering issue remains on phone, check browser console (Safari DevTools via Mac → 
Develop → [iPhone]) for errors. Most likely cause would be OOM from the audio buffer analysis
on a low-RAM device — can reduce FFT_SIZE or add a loading cap.

## FILES
src/audio/SongLoader.ts
src/ui/Splash.ts
src/main.ts
src/render/PostProcessing.ts
src/systems/RenderSystem.ts
vite.config.ts
