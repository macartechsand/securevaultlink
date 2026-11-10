#!/usr/bin/env node
// Entry point: `node securevault-mcp.mjs` speaks MCP over stdio. Logs go to stderr only (stdout is the protocol).
import { serve } from './broker';

serve();
process.stderr.write('securevault-agent-broker ready (stdio)\n');
