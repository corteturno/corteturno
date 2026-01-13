// middleware/auth.js

import jwt from 'jsonwebtoken';
import { query } from '../database.js';

export const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No autorizado - Token requerido' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verificar que el usuario existe y obtener tenant_id
    const result = await query(
      'SELECT id, tenant_id, email, name, role, onboarded FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token inválido' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado' });
    }
    return res.status(500).json({ error: 'Error de autenticación' });
  }
};

export const requireRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No tienes permisos para esta acción' });
    }
    next();
  };
};

// Middleware para validar que los recursos pertenecen al tenant del usuario
export const validateTenantAccess = (tableName, idField = 'id') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[idField] || req.body[idField];
      
      if (!resourceId) {
        return next();
      }

      const result = await query(
        `SELECT tenant_id FROM ${tableName} WHERE id = $1`,
        [resourceId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Recurso no encontrado' });
      }

      if (result.rows[0].tenant_id !== req.user.tenant_id) {
        return res.status(403).json({ error: 'Acceso denegado a este recurso' });
      }

      next();
    } catch (error) {
      return res.status(500).json({ error: 'Error validando acceso' });
    }
  };
};