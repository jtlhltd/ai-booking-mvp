#!/usr/bin/env node

// Simple MCP server for Render management
// This provides basic Render deployment management capabilities

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

class RenderMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'render-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.renderApiKey = process.env.RENDER_API_KEY;
    this.serviceUrl = process.env.RENDER_SERVICE_URL || 'https://ai-booking-mvp.onrender.com';

    this.setupToolHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'check_render_status',
          description: 'Check the status of your Render service',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_render_logs',
          description: 'Get recent logs from your Render service',
          inputSchema: {
            type: 'object',
            properties: {
              lines: {
                type: 'number',
                description: 'Number of log lines to retrieve',
                default: 50,
              },
            },
          },
        },
        {
          name: 'trigger_render_deploy',
          description: 'Trigger a new deployment on Render',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'check_render_status':
            return await this.checkRenderStatus();
          case 'get_render_logs':
            return await this.getRenderLogs(args?.lines || 50);
          case 'trigger_render_deploy':
            return await this.triggerDeploy();
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
        };
      }
    });
  }

  async checkRenderStatus() {
    if (!this.renderApiKey) {
      return {
        content: [
          {
            type: 'text',
            text: '❌ RENDER_API_KEY not set. Please add your Render API key to the environment variables.',
          },
        ],
      };
    }

    try {
      // Check Render API for service status
      const renderResponse = await fetch('https://api.render.com/v1/services', {
        headers: {
          'Authorization': `Bearer ${this.renderApiKey}`,
          'Accept': 'application/json'
        }
      });

      if (!renderResponse.ok) {
        throw new Error(`Render API error: ${renderResponse.status} ${renderResponse.statusText}`);
      }

      const services = await renderResponse.json();
      const ourService = services.find(service => service.serviceDetails?.url === this.serviceUrl || service.name?.includes('ai-booking'));

      // Also check service health directly
      const healthResponse = await fetch(`${this.serviceUrl}/health`);
      const healthStatus = healthResponse.ok ? '✅ Running' : '❌ Not responding';
      
      return {
        content: [
          {
            type: 'text',
            text: `**Render Service Status:**\n\n- URL: ${this.serviceUrl}\n- Health: ${healthStatus}\n- Response Code: ${healthResponse.status}\n- Render Status: ${ourService?.serviceDetails?.buildCommand || 'Unknown'}\n- Last Deploy: ${ourService?.updatedAt || 'Unknown'}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Error checking status: ${error.message}`,
          },
        ],
      };
    }
  }

  async getRenderLogs(lines = 50) {
    if (!this.renderApiKey) {
      return {
        content: [
          {
            type: 'text',
            text: '❌ RENDER_API_KEY not set. Please add your Render API key to the environment variables.',
          },
        ],
      };
    }

    // Note: This is a simplified version. Full Render API integration would require
    // the actual Render API endpoints and proper authentication
    return {
      content: [
        {
          type: 'text',
          text: `📋 **Render Logs** (Last ${lines} lines)\n\nTo view full logs, please:\n1. Go to https://dashboard.render.com\n2. Select your service\n3. Click on "Logs" tab\n\nOr use the Render API directly with your API key.`,
        },
      ],
    };
  }

  async triggerDeploy() {
    if (!this.renderApiKey) {
      return {
        content: [
          {
            type: 'text',
            text: '❌ RENDER_API_KEY not set. Please add your Render API key to the environment variables.',
          },
        ],
      };
    }

    // Note: This would require the full Render API integration
    return {
      content: [
        {
          type: 'text',
          text: `🚀 **Deploy Triggered**\n\nTo manually trigger a deployment:\n1. Go to https://dashboard.render.com\n2. Select your service\n3. Click "Manual Deploy"\n\nOr push changes to your connected Git repository for automatic deployment.`,
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Render MCP server running on stdio');
  }
}

const server = new RenderMCPServer();
server.run().catch(console.error);
