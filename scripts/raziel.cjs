// scripts/raziel.cjs
const fs = require('fs');
const path = require('path');

async function callRazielTool(toolName, args = {}) {
  const url = 'https://mcp.tide.org/mcp';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    })
  });

  const raw = await response.text();
  // MCP returns event-stream format: "event: message\ndata: { ... }\n\n"
  const lines = raw.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6));
      return data;
    }
  }
  return { raw };
}

async function main() {
  const toolName = process.argv[2];
  const argsJson = process.argv[3] ? JSON.parse(process.argv[3]) : {};
  if (!toolName) {
    console.error('Usage: node scripts/raziel.cjs <toolName> [jsonArgs]');
    process.exit(1);
  }
  try {
    const result = await callRazielTool(toolName, argsJson);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error calling Raziel:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { callRazielTool };
