#!/usr/bin/env node
import { loadConfig } from '../src/config.mjs';
import { chooseMode } from '../src/mode.mjs';
import { bannerFor } from '../src/banner.mjs';

let cdpPort;
try { cdpPort = Number(process.env.RB_CDP_PORT_OVERRIDE) || loadConfig().cdpPort; } catch { cdpPort = 9222; }
const mode = await chooseMode(cdpPort);
process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: bannerFor(mode) },
}));
