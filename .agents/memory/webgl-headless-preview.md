---
name: WebGL artifacts can't be screenshot-verified in the sandbox
description: Why R3F/Three.js previews show "Error creating WebGL context" and how to interpret it
---

The sandbox's headless screenshot/preview-capture browser has **no GPU**
(`VENDOR = 0xffff, DEVICE = 0xffff`), so any Three.js / @react-three/fiber
artifact logs `THREE.WebGLRenderer: Error creating WebGL context` and Vite's
runtime-error-plugin overlay covers the canvas in `screenshot` output.

**Why:** This is an environment limitation, NOT an app bug. Real browsers with a
GPU render the scene fine.

**How to apply:** When verifying a WebGL/3D artifact, ignore WebGL-context errors
from the screenshot tool. Verify instead via: typecheck passing, the 2D/DOM
overlays rendering correctly behind the error overlay, and clean browser console
apart from the WebGL-context lines. Do not "fix" it by disabling the canvas.
