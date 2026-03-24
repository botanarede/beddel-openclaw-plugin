import type { AnyAgentTool, OpenClawPluginApi, OpenClawPluginToolContext } from 'openclaw/plugin-sdk/core';
import { createBeddelTool } from './src/beddel-tool.js';

export default function register(api: OpenClawPluginApi) {
  api.registerTool(
    ((ctx: OpenClawPluginToolContext) => {
      if (ctx.sandboxed) return null;
      return createBeddelTool(api) as AnyAgentTool;
    }),
    { optional: true },
  );
}
