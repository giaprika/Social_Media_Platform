import {Server} from 'socket.io';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import logger from '../utils/logger.js';

let io;

export const initSocketServer = (httpServer) => {
    if (io) {
        return io;
    }

    io = new Server(httpServer, {
        cors: {
            origin: process.env.FRONTEND_URL || "http://localhost:3000",
            credentials: true,
        },
        path: '/socket.io',
    });

    // Middleware for authentication
    io.use((socket, next) => {
        try{
            const token = socket.handshake.auth?.token || 
            socket.handshake.headers?.authorization?.split(' ')[1]; // delete 'Bearer '
            if (!token) {
                logger.warn('Socket connection rejected: No token provided');
                return next(new Error('Authentication error: Token not provided'));
            }

            const decoded = jwt.verify(token, config.accessTokenSecret);
            socket.data.user = { id: decoded.id, email: decoded.email };
            logger.info(`Socket connected: User ID ${decoded.id}`);
            return next();

        } catch (error) {
            logger.error('Socket authentication error', { error: error.message });
            return next(new Error('Authentication error'));
        }
    });

    io.on('connection', (socket) => {
        const userId = socket.data.user.id;
        if (userId) {
            socket.join(`user_${userId}`);
            logger.info(`User ${userId} joined room user_${userId}`);
        }

        socket.on('disconnect', () => {
            logger.info(`Socket disconnected: User ID ${userId}`);
        });
    });

    return io;
};

// Hàm emit notification đến những user cụ thể
export const emitNotificationToUsers = (userIds, payload) => {
    if (!io) {
        logger.warn('Socket.io not initialized. Cannot emit notifications.');
        return false;
    }
    userIds.forEach((userId) => {
        io.to(`user_${userId}`).emit('notification', payload);
        logger.info(`Emitted notification to user_${userId}`, { payload });
    });
    return true;
};

