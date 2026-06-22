import { useEffect, useState } from "react";
import { useGame } from "../state/GameProvider";

/**
 * Full-screen glitch effect. Re-triggers whenever `glitchKey` changes (wrong
 * click or idle taunt) by briefly toggling a CSS animation class.
 */
export function GlitchOverlay() {
  const { glitchKey } = useGame();
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (glitchKey === 0) return;
    setActive(true);
    const id = window.setTimeout(() => setActive(false), 1000);
    return () => window.clearTimeout(id);
  }, [glitchKey]);

  if (!active) return null;
  // Re-key on each trigger so the CSS animations always restart. Three stacked
  // layers fake a chromatic aberration / VHS tear: red + cyan offset channels
  // plus a scanline/noise sheet.
  return (
    <div className="glitch" key={glitchKey} aria-hidden>
      <div className="glitch__chroma glitch__chroma--r" />
      <div className="glitch__chroma glitch__chroma--c" />
      <div className="glitch__scan" />
    </div>
  );
}
