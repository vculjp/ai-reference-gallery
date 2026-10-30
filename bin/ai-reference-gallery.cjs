#!/usr/bin/env node
"use strict";

// npm/npx entry point; points to the same implementation as SKILL.md. There
// are no npm runtime dependencies and no gallery images in the package.
require("../.agents/skills/ai-reference-gallery/scripts/gallery.cjs")
  .main(process.argv.slice(2)).catch((error) => {
    console.error(`Skill failed: ${error.message}`);
    process.exitCode = 1;
  });
