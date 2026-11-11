#!/usr/bin/env node
import { loadConfig } from '../src/config.mjs';
import { chooseMode } from '../src/mode.mjs';
import { bannerFor } from '../src/banner.mjs';
import { autoUpEnabled } from '../src/autoup.mjs';

let cdpPort; let configured = false;
try { const c = loadConfig(); cdpPort = Number(process.env.RB_CDP_PORT_OVERRIDE) || c.cdpPort; configured = Boolean(c.instanceId); } catch { cdpPort = 9222; }
const mode = await chooseMode(cdpPort);
process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: bannerFor(mode, configured && autoUpEnabled()) },
}));
