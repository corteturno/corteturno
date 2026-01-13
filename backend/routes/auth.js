// routes/auth.js

import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { query } from '../database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Registro
router.post('/register',
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').trim().notEmpty(),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password, name } = req.body;

      // Verificar si el usuario ya existe
      const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: 'El email ya está registrado' });
      }

      // Hash del password
      const passwordHash = await bcrypt.hash(password, 10);

      // Crear tenant
      const tenantResult = await query(
        'INSERT INTO tenants (shop_name) VALUES ($1) RETURNING id',
        ['Mi Barbería']
      );
      const tenantId = tenantResult.rows[0].id;

      // Crear usuario
      const userResult = await query(
        `INSERT INTO users (tenant_id, email, password_hash, name, role, onboarded) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING id, tenant_id, email, name, role, onboarded`,
        [tenantId, email, passwordHash, name, 'admin', false]
      );

      const user = userResult.rows[0];

      // Generar token JWT
      const token = jwt.sign(
        { userId: user.id, tenantId: user.tenant_id },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.status(201).json({
        message: 'Usuario registrado exitosamente',
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenant_id,
          onboarded: user.onboarded
        }
      });
    } catch (error) {
      console.error('Error en registro:', error);
      res.status(500).json({ error: 'Error al registrar usuario' });
    }
  }
);

// Login
router.post('/login',
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      // Buscar usuario
      const result = await query(
        'SELECT id, tenant_id, email, password_hash, name, role, onboarded FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Credenciales incorrectas' });
      }

      const user = result.rows[0];

      // Verificar password
      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Credenciales incorrectas' });
      }

      // Generar token
      const token = jwt.sign(
        { userId: user.id, tenantId: user.tenant_id },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        message: 'Login exitoso',
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenant_id,
          onboarded: user.onboarded
        }
      });
    } catch (error) {
      console.error('Error en login:', error);
      res.status(500).json({ error: 'Error al iniciar sesión' });
    }
  }
);

// Obtener perfil del usuario actual
router.get('/me', authenticate, async (req, res) => {
  res.json({ user: req.user });
});

// Actualizar perfil
router.patch('/me', authenticate, async (req, res) => {
  try {
    const { name } = req.body;
    
    const result = await query(
      'UPDATE users SET name = $1 WHERE id = $2 RETURNING id, email, name, role, onboarded',
      [name, req.user.id]
    );

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Error actualizando perfil:', error);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

export default router;