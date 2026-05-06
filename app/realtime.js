import { Server as SocketIOServer } from 'socket.io';
import { installAdminHubSocketAuth, resolveSocketIoAllowedOrigins } from '../lib/socket-io-admin-hub.js';

export function createSocketIo(server) {
  const socketIoAllowedOrigins = resolveSocketIoAllowedOrigins();
  const io = new SocketIOServer(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (!socketIoAllowedOrigins.length) {
          const prod = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
          if (prod) return callback(new Error('Socket.IO CORS: set PUBLIC_BASE_URL or SOCKETIO_EXTRA_ORIGINS'), false);
          return callback(null, true);
        }
        return callback(null, socketIoAllowedOrigins.includes(origin));
      },
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  installAdminHubSocketAuth(io);

  return { io, socketIoAllowedOrigins };
}

export function installAdminHubRealtimeHandlers(io, opts = {}) {
  const ADMIN_HUB_BURST_WINDOW_MS = opts.burstWindowMs ?? 60_000;
  const ADMIN_HUB_BURST_MAX = opts.burstMax ?? 45;
  const adminHubRequestBursts = new Map();

  io.on('connection', (socket) => {
    console.log('Admin Hub client connected:', socket.id);

    socket.join('admin-hub');

    socket.on('disconnect', () => {
      adminHubRequestBursts.delete(socket.id);
      console.log('Admin Hub client disconnected:', socket.id);
    });

    socket.on('request-update', async (dataType) => {
      const {
        getBusinessStats,
        getRecentActivity,
        getClientsData,
        getCallsData,
        getAnalyticsData,
        getSystemHealthData
      } = opts;

      try {
        const now = Date.now();
        const bucket = adminHubRequestBursts.get(socket.id) || [];
        const pruned = bucket.filter((t) => now - t < ADMIN_HUB_BURST_WINDOW_MS);
        pruned.push(now);
        if (pruned.length > ADMIN_HUB_BURST_MAX) {
          socket.emit('error', { message: 'Rate limit exceeded' });
          return;
        }
        adminHubRequestBursts.set(socket.id, pruned);

        let updateData = {};
        switch (dataType) {
          case 'business-stats':
            updateData = await getBusinessStats();
            break;
          case 'recent-activity':
            updateData = await getRecentActivity();
            break;
          case 'clients':
            updateData = await getClientsData();
            break;
          case 'calls':
            updateData = await getCallsData();
            break;
          case 'analytics':
            updateData = await getAnalyticsData();
            break;
          case 'system-health':
            updateData = await getSystemHealthData();
            break;
          case 'all':
            updateData = {
              businessStats: await getBusinessStats(),
              recentActivity: await getRecentActivity(),
              clients: await getClientsData(),
              calls: await getCallsData(),
              analytics: await getAnalyticsData(),
              systemHealth: await getSystemHealthData()
            };
            break;
          default:
            updateData = {};
        }

        socket.emit('data-update', { type: dataType, data: updateData });
      } catch (error) {
        console.error('Error handling real-time update request:', error);
        socket.emit('error', { message: 'Failed to fetch data' });
      }
    });
  });

  return function broadcastUpdate(type, data) {
    io.to('admin-hub').emit('data-update', { type, data });
  };
}

