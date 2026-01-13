// routes/onboarding.js

import express from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Completar onboarding
router.post('/complete', authenticate, async (req, res) => {
  const client = await query('SELECT 1'); // Get client for transaction
  
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { shopName, branches, services } = req.body;
    const tenantId = req.user.tenant_id;

    await query('BEGIN');

    // Actualizar nombre de la barbería
    await query(
      'UPDATE tenants SET shop_name = $1 WHERE id = $2',
      [shopName, tenantId]
    );

    // Crear sucursales y sillas
    for (const branch of branches) {
      const branchResult = await query(
        `INSERT INTO branches (tenant_id, name, work_days, start_time, end_time, lunch_start, lunch_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          tenantId,
          branch.name,
          branch.workDays,
          branch.startTime,
          branch.endTime,
          branch.lunchStart,
          branch.lunchEnd
        ]
      );

      const branchId = branchResult.rows[0].id;

      // Crear sillas para la sucursal
      if (Array.isArray(branch.chairs)) {
        // New format with chair objects
        for (const chair of branch.chairs) {
          await query(
            'INSERT INTO chairs (branch_id, chair_number, commission) VALUES ($1, $2, $3)',
            [branchId, chair.number, chair.commission || 15]
          );
        }
      } else {
        // Legacy format with chair count
        for (let i = 1; i <= branch.chairs; i++) {
          await query(
            'INSERT INTO chairs (branch_id, chair_number, commission) VALUES ($1, $2, $3)',
            [branchId, i, 15]
          );
        }
      }
    }

    // Crear servicios
    for (const service of services) {
      if (service.name && service.price) {
        await query(
          'INSERT INTO services (tenant_id, name, price, duration) VALUES ($1, $2, $3, $4)',
          [tenantId, service.name, parseFloat(service.price), service.duration]
        );
      }
    }

    // Marcar usuario como onboarded
    await query(
      'UPDATE users SET onboarded = true WHERE id = $1',
      [req.user.id]
    );

    await query('COMMIT');

    res.json({ message: 'Onboarding completado exitosamente' });
  } catch (error) {
    await query('ROLLBACK');
    console.error('Error en onboarding:', error);
    res.status(500).json({ error: 'Error al completar configuración' });
  }
});

export default router;