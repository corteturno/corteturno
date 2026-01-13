// server.js

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import authRoutes from './routes/auth.js';
import onboardingRoutes from './routes/onboarding.js';
import apiRoutes from './routes/index.js';
import publicRoutes from './routes/public.js';
import stripeRoutes from './routes/stripe.js';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "https://palaeobiologic-proximately-demi.ngrok-free.dev",
      /\.ngrok-free\.dev$/,
      /\.ngrok\.io$/
    ],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

const PORT = process.env.PORT || 3000;

// Make io available to routes
app.set('io', io);

// Middleware
// permite localhost + tu frontend ngrok
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://palaeobiologic-proximately-demi.ngrok-free.dev',
    /\.ngrok-free\.dev$/,
    /\.ngrok\.io$/
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));

// Raw body parser for Stripe webhooks (must be before express.json())
app.use('/api/stripe/webhook', express.raw({type: 'application/json'}));

app.use(express.json());

// Log de requests en desarrollo
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api', apiRoutes);

// Catch-all handler: send back React's index.html file for SPA routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('✅ Cliente conectado:', socket.id, 'desde:', socket.handshake.address);
  console.log('🔗 Headers:', socket.handshake.headers.origin);
  
  socket.on('join-tenant', (tenantId) => {
    socket.join(`tenant-${tenantId}`);
    console.log(`🏢 Cliente ${socket.id} se unió al tenant ${tenantId}`);
    console.log('🏢 Rooms del cliente:', Array.from(socket.rooms));
    
    // Confirmar que se unió correctamente
    socket.emit('joined-tenant', { tenantId, success: true });
  });
  
  socket.on('join-branch', (branchId) => {
    socket.join(`branch-${branchId}`);
    console.log(`🏪 Cliente ${socket.id} se unió a la branch ${branchId}`);
    console.log('🏪 Rooms del cliente:', Array.from(socket.rooms));
    console.log('🏪 Total clientes en branch-' + branchId + ':', io.sockets.adapter.rooms.get(`branch-${branchId}`)?.size || 0);
    
    // Confirmar que se unió correctamente
    socket.emit('joined-branch', { branchId, success: true });
  });
  
  socket.on('test-notification', (data) => {
    console.log('🧪 Test notification received:', data);
    const testNotification = {
      type: 'test',
      tenantId: data.tenantId,
      branchId: data.branchId,
      data: { 
        message: 'Socket.IO funciona correctamente!',
        clientName: 'Cliente Prueba',
        serviceName: 'Servicio Prueba',
        chairNumber: '1',
        date: new Date().toISOString().split('T')[0],
        time: '14:30'
      }
    };
    
    // Enviar a todos los clientes conectados como prueba
    io.emit('notification', testNotification);
    console.log('🧪 Test notification enviada a todos los clientes');
  });
  
  socket.on('disconnect', (reason) => {
    console.log('❌ Cliente desconectado:', socket.id, 'Razón:', reason);
  });
  
  socket.on('error', (error) => {
    console.error('❌ Socket error:', error);
  });
});

// Iniciar servidor
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║   🚀 BarberOS Backend Server              ║
║                                           ║
║   Puerto: ${PORT}                            ║
║   Entorno: ${process.env.NODE_ENV || 'development'}              ║
║   Base de datos: PostgreSQL               ║
║   WebSocket: ✅ Habilitado                 ║
║                                           ║
║   Endpoints disponibles:                  ║
║   - POST /api/auth/register               ║
║   - POST /api/auth/login                  ║
║   - GET  /api/auth/me                     ║
║   - POST /api/onboarding/complete         ║
║   - GET  /api/branches                    ║
║   - GET  /api/services                    ║
║   - GET  /api/appointments                ║
║   - GET  /api/metrics                     ║
║                                           ║
║   Estado: ✅ Listo                         ║
╚═══════════════════════════════════════════╝
  `);
});

export default app;