// routes/index.js

import express from 'express';
import { query } from '../database.js';
import { authenticate, validateTenantAccess } from '../middleware/auth.js';

const router = express.Router();

// =====================================================
// BRANCHES
// =====================================================

// Obtener sucursales con sillas
router.get('/branches', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT b.*, 
        json_agg(json_build_object('id', c.id, 'chair_number', c.chair_number, 'commission', c.commission) ORDER BY c.chair_number) as chairs
       FROM branches b
       LEFT JOIN chairs c ON b.id = c.branch_id
       WHERE b.tenant_id = $1
       GROUP BY b.id
       ORDER BY b.created_at`,
      [req.user.tenant_id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo sucursales:', error);
    res.status(500).json({ error: 'Error al obtener sucursales' });
  }
});

// Crear sucursal
router.post('/branches', authenticate, async (req, res) => {
  try {
    const { name, workDays, startTime, endTime, lunchStart, lunchEnd, chairs } = req.body;
    
    await query('BEGIN');

    const branchResult = await query(
      `INSERT INTO branches (tenant_id, name, work_days, start_time, end_time, lunch_start, lunch_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.tenant_id, name, workDays, startTime, endTime, lunchStart, lunchEnd]
    );

    const branch = branchResult.rows[0];

    // Crear sillas
    if (Array.isArray(chairs)) {
      // New format with chair objects
      for (const chair of chairs) {
        await query(
          'INSERT INTO chairs (branch_id, chair_number, commission) VALUES ($1, $2, $3)',
          [branch.id, chair.number, chair.commission || 15]
        );
      }
    } else {
      // Legacy format with chair count
      for (let i = 1; i <= (chairs || 2); i++) {
        await query(
          'INSERT INTO chairs (branch_id, chair_number, commission) VALUES ($1, $2, $3)',
          [branch.id, i, 15]
        );
      }
    }

    await query('COMMIT');
    res.status(201).json(branch);
  } catch (error) {
    await query('ROLLBACK');
    console.error('Error creando sucursal:', error);
    res.status(500).json({ error: 'Error al crear sucursal' });
  }
});

// Actualizar sucursal
router.patch('/branches/:id', authenticate, async (req, res) => {
  try {
    const { name, workDays, startTime, endTime, lunchStart, lunchEnd, chairs } = req.body;
    const { id } = req.params;

    await query('BEGIN');

    // Actualizar sucursal
    const branchResult = await query(
      `UPDATE branches SET name = $1, work_days = $2, start_time = $3, end_time = $4, lunch_start = $5, lunch_end = $6
       WHERE id = $7 AND tenant_id = $8 RETURNING *`,
      [name, workDays, startTime, endTime, lunchStart, lunchEnd, id, req.user.tenant_id]
    );

    if (branchResult.rows.length === 0) {
      await query('ROLLBACK');
      return res.status(404).json({ error: 'Sucursal no encontrada' });
    }

    // Actualizar sillas si es necesario
    if (chairs) {
      if (Array.isArray(chairs)) {
        // New format: replace all chairs
        await query('DELETE FROM chairs WHERE branch_id = $1', [id]);
        for (const chair of chairs) {
          await query(
            'INSERT INTO chairs (branch_id, chair_number, commission) VALUES ($1, $2, $3)',
            [id, chair.number, chair.commission || 15]
          );
        }
      } else {
        // Legacy format: chair count
        const currentChairs = await query('SELECT COUNT(*) as count FROM chairs WHERE branch_id = $1', [id]);
        const currentCount = parseInt(currentChairs.rows[0].count);
        
        if (chairs > currentCount) {
          for (let i = currentCount + 1; i <= chairs; i++) {
            await query('INSERT INTO chairs (branch_id, chair_number, commission) VALUES ($1, $2, $3)', [id, i, 15]);
          }
        } else if (chairs < currentCount) {
          await query('DELETE FROM chairs WHERE branch_id = $1 AND chair_number > $2', [id, chairs]);
        }
      }
    }

    await query('COMMIT');
    res.json(branchResult.rows[0]);
  } catch (error) {
    await query('ROLLBACK');
    console.error('Error actualizando sucursal:', error);
    res.status(500).json({ error: 'Error al actualizar sucursal' });
  }
});

// Eliminar sucursal
router.delete('/branches/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    await query('BEGIN');
    
    // Eliminar sillas primero
    await query('DELETE FROM chairs WHERE branch_id = $1', [id]);
    
    // Eliminar sucursal
    const result = await query(
      'DELETE FROM branches WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, req.user.tenant_id]
    );

    if (result.rows.length === 0) {
      await query('ROLLBACK');
      return res.status(404).json({ error: 'Sucursal no encontrada' });
    }

    await query('COMMIT');
    res.json({ message: 'Sucursal eliminada exitosamente' });
  } catch (error) {
    await query('ROLLBACK');
    console.error('Error eliminando sucursal:', error);
    res.status(500).json({ error: 'Error al eliminar sucursal' });
  }
});

// =====================================================
// SERVICES
// =====================================================

// Obtener servicios
router.get('/services', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM services WHERE tenant_id = $1 ORDER BY created_at',
      [req.user.tenant_id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo servicios:', error);
    res.status(500).json({ error: 'Error al obtener servicios' });
  }
});

// Crear servicio
router.post('/services', authenticate, async (req, res) => {
  try {
    const { name, price, duration } = req.body;
    
    const result = await query(
      'INSERT INTO services (tenant_id, name, price, duration) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.tenant_id, name, price, duration]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creando servicio:', error);
    res.status(500).json({ error: 'Error al crear servicio' });
  }
});

// Actualizar servicio
router.patch('/services/:id', authenticate, async (req, res) => {
  try {
    const { name, price, duration } = req.body;
    const { id } = req.params;
    
    const result = await query(
      'UPDATE services SET name = $1, price = $2, duration = $3 WHERE id = $4 AND tenant_id = $5 RETURNING *',
      [name, price, duration, id, req.user.tenant_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando servicio:', error);
    res.status(500).json({ error: 'Error al actualizar servicio' });
  }
});

// Eliminar servicio
router.delete('/services/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await query(
      'DELETE FROM services WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, req.user.tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }

    res.json({ message: 'Servicio eliminado exitosamente' });
  } catch (error) {
    console.error('Error eliminando servicio:', error);
    res.status(500).json({ error: 'Error al eliminar servicio' });
  }
});

// =====================================================
// APPOINTMENTS
// =====================================================

// Obtener citas
router.get('/appointments', authenticate, async (req, res) => {
  try {
    const { date, branch } = req.query;
    
    console.log('📅 GET /appointments - Parámetros recibidos:', {
      tenant_id: req.user.tenant_id,
      date,
      branch,
      query: req.query
    });
    
    let queryText = `
      SELECT a.*, b.name as branch_name, c.chair_number, s.name as service_name
      FROM appointments a
      JOIN branches b ON a.branch_id = b.id
      JOIN chairs c ON a.chair_id = c.id
      JOIN services s ON a.service_id = s.id
      WHERE a.tenant_id = $1
    `;
    const params = [req.user.tenant_id];
    
    if (date) {
      queryText += ' AND a.appointment_date = $2';
      params.push(date);
    }
    
    if (branch) {
      queryText += ` AND a.branch_id = $${params.length + 1}`;
      params.push(branch);
    }
    
    queryText += ' ORDER BY a.appointment_date DESC, a.appointment_time ASC';
    
    console.log('🔍 Query SQL:', queryText);
    console.log('🔍 Parámetros:', params);
    
    const result = await query(queryText, params);
    
    console.log('📊 Citas encontradas:', result.rows.length);
    if (result.rows.length > 0) {
      console.log('📋 Primeras 3 citas:', result.rows.slice(0, 3).map(a => ({
        id: a.id,
        client: a.client_name,
        date: a.appointment_date,
        time: a.appointment_time,
        branch: a.branch_name,
        chair: a.chair_number,
        service: a.service_name,
        status: a.status
      })));
    }
    
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error obteniendo citas:', error);
    res.status(500).json({ error: 'Error al obtener citas' });
  }
});

// Crear cita
router.post('/appointments', authenticate, async (req, res) => {
  try {
    const { branchId, chairId, serviceId, clientName, clientPhone, date, time } = req.body;

    // Verificar si ya existe una cita en ese horario
    const existing = await query(
      `SELECT id FROM appointments 
       WHERE chair_id = $1 AND appointment_date = $2 AND appointment_time = $3 AND status = 'scheduled'`,
      [chairId, date, time]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Ya existe una cita en ese horario' });
    }

    // Verificar que branch, chair y service pertenecen al tenant
    const branchCheck = await query(
      'SELECT id FROM branches WHERE id = $1 AND tenant_id = $2',
      [branchId, req.user.tenant_id]
    );

    if (branchCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Sucursal no válida' });
    }

    const result = await query(
      `INSERT INTO appointments 
       (tenant_id, branch_id, chair_id, service_id, client_name, client_phone, appointment_date, appointment_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.user.tenant_id, branchId, chairId, serviceId, clientName, clientPhone, date, time]
    );

    // Get additional data for notification
    const [serviceData, chairData] = await Promise.all([
      query('SELECT name FROM services WHERE id = $1', [serviceId]),
      query('SELECT chair_number FROM chairs WHERE id = $1', [chairId])
    ]);

    // Emit notification
    const io = req.app.get('io');
    if (io) {
      const notification = {
        type: 'admin_booking',
        tenantId: req.user.tenant_id,
        branchId: branchId,
        data: {
          clientName,
          clientPhone,
          serviceName: serviceData.rows[0]?.name,
          chairNumber: chairData.rows[0]?.chair_number,
          date,
          time,
          action: 'creada'
        }
      };
      
      console.log('Emitiendo notificación de cita admin:', notification);
      io.to(`tenant-${req.user.tenant_id}`).emit('notification', notification);
      io.emit('notification', notification);
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creando cita:', error);
    res.status(500).json({ error: 'Error al crear cita' });
  }
});

// Actualizar estado de cita
router.patch('/appointments/:id', authenticate, validateTenantAccess('appointments', 'id'), async (req, res) => {
  try {
    const { status, appointment_date, appointment_time } = req.body;
    const { id } = req.params;

    let updateFields = {};
    if (status) updateFields.status = status;
    if (appointment_date) updateFields.appointment_date = appointment_date;
    if (appointment_time) updateFields.appointment_time = appointment_time;

    const setClause = Object.keys(updateFields).map((key, index) => `${key} = $${index + 1}`).join(', ');
    const values = [...Object.values(updateFields), id, req.user.tenant_id];

    const result = await query(
      `UPDATE appointments SET ${setClause} WHERE id = $${values.length - 1} AND tenant_id = $${values.length} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    // If rescheduling, emit notification
    if (appointment_date || appointment_time) {
      const [serviceData, chairData] = await Promise.all([
        query('SELECT name FROM services WHERE id = $1', [result.rows[0].service_id]),
        query('SELECT chair_number FROM chairs WHERE id = $1', [result.rows[0].chair_id])
      ]);

      const io = req.app.get('io');
      if (io) {
        const notification = {
          type: 'appointment_rescheduled',
          tenantId: req.user.tenant_id,
          branchId: result.rows[0].branch_id,
          data: {
            clientName: result.rows[0].client_name,
            clientPhone: result.rows[0].client_phone,
            serviceName: serviceData.rows[0]?.name,
            chairNumber: chairData.rows[0]?.chair_number,
            date: result.rows[0].appointment_date.split('T')[0],
            time: result.rows[0].appointment_time,
            action: 'reagendada'
          }
        };
        
        console.log('Emitiendo notificación de reagendamiento admin:', notification);
        io.to(`tenant-${req.user.tenant_id}`).emit('notification', notification);
        io.emit('notification', notification);
      }
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando cita:', error);
    res.status(500).json({ error: 'Error al actualizar cita' });
  }
});

// Eliminar cita
router.delete('/appointments/:id', authenticate, validateTenantAccess('appointments', 'id'), async (req, res) => {
  try {
    const { id } = req.params;

    // Get appointment data before deletion for notification
    const appointmentData = await query(
      `SELECT a.*, s.name as service_name, c.chair_number 
       FROM appointments a 
       JOIN services s ON a.service_id = s.id 
       JOIN chairs c ON a.chair_id = c.id 
       WHERE a.id = $1 AND a.tenant_id = $2`,
      [id, req.user.tenant_id]
    );

    if (appointmentData.rows.length === 0) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    const result = await query(
      'DELETE FROM appointments WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, req.user.tenant_id]
    );

    // Emit cancellation notification
    const appt = appointmentData.rows[0];
    const io = req.app.get('io');
    if (io) {
      const notification = {
        type: 'appointment_cancelled',
        tenantId: req.user.tenant_id,
        branchId: appt.branch_id,
        data: {
          clientName: appt.client_name,
          clientPhone: appt.client_phone,
          serviceName: appt.service_name,
          chairNumber: appt.chair_number,
          date: appt.appointment_date.split('T')[0],
          time: appt.appointment_time,
          action: 'cancelada'
        }
      };
      
      console.log('Emitiendo notificación de cancelación admin:', notification);
      io.to(`tenant-${req.user.tenant_id}`).emit('notification', notification);
      io.emit('notification', notification);
    }

    res.json({ message: 'Cita cancelada exitosamente' });
  } catch (error) {
    console.error('Error eliminando cita:', error);
    res.status(500).json({ error: 'Error al eliminar cita' });
  }
});

// =====================================================
// USERS
// =====================================================

// Obtener usuarios del tenant
router.get('/users', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, email, name, role, onboarded, created_at FROM users WHERE tenant_id = $1 ORDER BY created_at',
      [req.user.tenant_id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo usuarios:', error);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// Actualizar usuario
router.patch('/users/:id', authenticate, async (req, res) => {
  try {
    const { name, email, role } = req.body;
    const { id } = req.params;
    
    const result = await query(
      'UPDATE users SET name = $1, email = $2, role = $3 WHERE id = $4 AND tenant_id = $5 RETURNING id, email, name, role, onboarded, created_at',
      [name, email, role, id, req.user.tenant_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando usuario:', error);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

// Eliminar usuario
router.delete('/users/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    // No permitir que un usuario se elimine a sí mismo
    if (id === req.user.id) {
      return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
    }
    
    const result = await query(
      'DELETE FROM users WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, req.user.tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({ message: 'Usuario eliminado exitosamente' });
  } catch (error) {
    console.error('Error eliminando usuario:', error);
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});

// =====================================================
// AVAILABLE TIMES
// =====================================================

// Obtener horarios disponibles
router.get('/available-times', authenticate, async (req, res) => {
  try {
    const { date, branchId, chairId, serviceId } = req.query;
    
    if (!date || !branchId || !chairId || !serviceId) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos' });
    }

    // Obtener información de la sucursal
    const branchResult = await query(
      'SELECT work_days, start_time, end_time, lunch_start, lunch_end FROM branches WHERE id = $1 AND tenant_id = $2',
      [branchId, req.user.tenant_id]
    );

    if (branchResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sucursal no encontrada' });
    }

    const branch = branchResult.rows[0];
    
    // Verificar si es día laboral
    const dayOfWeek = new Date(date).toLocaleDateString('es-ES', { weekday: 'long' });
    const dayName = dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1);
    
    if (!branch.work_days.includes(dayName)) {
      return res.json([]);
    }

    // Obtener duración del servicio
    const serviceResult = await query(
      'SELECT duration FROM services WHERE id = $1 AND tenant_id = $2',
      [serviceId, req.user.tenant_id]
    );

    if (serviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }

    const serviceDuration = serviceResult.rows[0].duration || 30;

    // Obtener citas existentes para esa silla y fecha
    const appointmentsResult = await query(
      `SELECT a.appointment_time, s.duration 
       FROM appointments a
       JOIN services s ON a.service_id = s.id
       WHERE a.chair_id = $1 AND a.appointment_date = $2 AND a.status = 'scheduled'`,
      [chairId, date]
    );

    const existingAppointments = appointmentsResult.rows;

    // Generar horarios disponibles
    const timeSlots = [];
    const startTime = branch.start_time;
    const endTime = branch.end_time;
    const lunchStart = branch.lunch_start;
    const lunchEnd = branch.lunch_end;

    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    const [lunchStartHour, lunchStartMin] = lunchStart ? lunchStart.split(':').map(Number) : [0, 0];
    const [lunchEndHour, lunchEndMin] = lunchEnd ? lunchEnd.split(':').map(Number) : [0, 0];

    let currentTime = startHour * 60 + startMin; // minutos desde medianoche
    const endTimeMinutes = endHour * 60 + endMin;
    const lunchStartMinutes = lunchStart ? lunchStartHour * 60 + lunchStartMin : null;
    const lunchEndMinutes = lunchEnd ? lunchEndHour * 60 + lunchEndMin : null;

    while (currentTime + serviceDuration <= endTimeMinutes) {
      const hour = Math.floor(currentTime / 60);
      const minute = currentTime % 60;
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      
      // Verificar si está en horario de almuerzo
      const isLunchTime = lunchStartMinutes && lunchEndMinutes && 
        currentTime >= lunchStartMinutes && currentTime < lunchEndMinutes;
      
      // Verificar si hay conflicto con citas existentes
      const hasConflict = existingAppointments.some(appt => {
        const [apptHour, apptMin] = appt.appointment_time.split(':').map(Number);
        const apptStartMinutes = apptHour * 60 + apptMin;
        const apptDuration = appt.duration || 30;
        const apptEndMinutes = apptStartMinutes + apptDuration;
        
        // Verificar solapamiento
        return (currentTime < apptEndMinutes && currentTime + serviceDuration > apptStartMinutes);
      });

      if (!isLunchTime && !hasConflict) {
        timeSlots.push({
          time: timeString,
          display: timeString,
          available: true
        });
      }

      currentTime += 30; // Incrementar en intervalos de 30 minutos
    }

    res.json(timeSlots);
  } catch (error) {
    console.error('Error obteniendo horarios disponibles:', error);
    res.status(500).json({ error: 'Error al obtener horarios disponibles' });
  }
});

// =====================================================
// METRICS
// =====================================================

// Crear datos de prueba (temporal)
router.post('/test-data', authenticate, async (req, res) => {
  try {
    console.log('🧪 Creando datos de prueba para tenant:', req.user.tenant_id);
    
    // Obtener la primera sucursal del usuario
    const branchResult = await query(
      'SELECT id FROM branches WHERE tenant_id = $1 LIMIT 1',
      [req.user.tenant_id]
    );
    
    if (branchResult.rows.length === 0) {
      return res.status(400).json({ error: 'No hay sucursales disponibles' });
    }
    
    const branchId = branchResult.rows[0].id;
    console.log('🏢 Usando sucursal:', branchId);
    
    // Obtener la primera silla
    const chairResult = await query(
      'SELECT id FROM chairs WHERE branch_id = $1 LIMIT 1',
      [branchId]
    );
    
    if (chairResult.rows.length === 0) {
      return res.status(400).json({ error: 'No hay sillas disponibles' });
    }
    
    const chairId = chairResult.rows[0].id;
    console.log('🪑 Usando silla:', chairId);
    
    // Obtener el primer servicio
    const serviceResult = await query(
      'SELECT id FROM services WHERE tenant_id = $1 LIMIT 1',
      [req.user.tenant_id]
    );
    
    if (serviceResult.rows.length === 0) {
      return res.status(400).json({ error: 'No hay servicios disponibles' });
    }
    
    const serviceId = serviceResult.rows[0].id;
    console.log('✂️ Usando servicio:', serviceId);
    
    // Crear citas de prueba para ayer, hoy y mañana
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    console.log('📅 Fechas:', { yesterday: yesterdayStr, today, tomorrow: tomorrowStr });
    
    const testAppointments = [
      // Citas para ayer
      {
        clientName: 'Roberto Silva',
        clientPhone: '777888999',
        date: yesterdayStr,
        time: '10:00',
        status: 'completed'
      },
      {
        clientName: 'Laura Fernández',
        clientPhone: '666777888',
        date: yesterdayStr,
        time: '14:30',
        status: 'completed'
      },
      // Citas para hoy
      {
        clientName: 'Juan Pérez',
        clientPhone: '123456789',
        date: today,
        time: '10:00',
        status: 'scheduled'
      },
      {
        clientName: 'María García',
        clientPhone: '987654321',
        date: today,
        time: '11:00',
        status: 'completed'
      },
      {
        clientName: 'Carlos López',
        clientPhone: '555666777',
        date: today,
        time: '14:00',
        status: 'scheduled'
      },
      // Citas para mañana
      {
        clientName: 'Ana Martínez',
        clientPhone: '111222333',
        date: tomorrowStr,
        time: '09:00',
        status: 'scheduled'
      },
      {
        clientName: 'Pedro González',
        clientPhone: '444555666',
        date: tomorrowStr,
        time: '15:30',
        status: 'scheduled'
      }
    ];
    
    let createdCount = 0;
    for (const appt of testAppointments) {
      try {
        await query(
          `INSERT INTO appointments 
           (tenant_id, branch_id, chair_id, service_id, client_name, client_phone, appointment_date, appointment_time, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [req.user.tenant_id, branchId, chairId, serviceId, appt.clientName, appt.clientPhone, appt.date, appt.time, appt.status]
        );
        createdCount++;
        console.log(`✅ Cita creada: ${appt.clientName} - ${appt.date} ${appt.time}`);
      } catch (error) {
        console.log(`⚠️ Error creando cita para ${appt.clientName}:`, error.message);
      }
    }
    
    console.log(`🎉 Datos de prueba creados: ${createdCount}/${testAppointments.length} citas`);
    res.json({ 
      message: `Datos de prueba creados exitosamente: ${createdCount} citas`,
      created: createdCount,
      total: testAppointments.length
    });
  } catch (error) {
    console.error('❌ Error creando datos de prueba:', error);
    res.status(500).json({ error: 'Error al crear datos de prueba' });
  }
});

// Obtener métricas
router.get('/metrics', authenticate, async (req, res) => {
  try {
    const { date, branch } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    console.log('Calculating metrics for:', { branch, date: targetDate, tenant: req.user.tenant_id });

    // Citas del día específico para la sucursal específica
    const todayAppts = await query(
      `SELECT COUNT(*) as count FROM appointments 
       WHERE tenant_id = $1 AND branch_id = $2 AND appointment_date = $3`,
      [req.user.tenant_id, branch, targetDate]
    );

    // Completadas del día específico
    const completed = await query(
      `SELECT COUNT(*) as count FROM appointments 
       WHERE tenant_id = $1 AND branch_id = $2 AND appointment_date = $3 AND status = 'completed'`,
      [req.user.tenant_id, branch, targetDate]
    );

    // No-shows del día específico
    const noShows = await query(
      `SELECT COUNT(*) as count FROM appointments 
       WHERE tenant_id = $1 AND branch_id = $2 AND appointment_date = $3 AND status = 'no-show'`,
      [req.user.tenant_id, branch, targetDate]
    );

    // Ingresos del día específico
    const revenue = await query(
      `SELECT COALESCE(SUM(s.price), 0) as total
       FROM appointments a
       JOIN services s ON a.service_id = s.id
       WHERE a.tenant_id = $1 AND a.branch_id = $2 AND a.appointment_date = $3 AND a.status = 'completed'`,
      [req.user.tenant_id, branch, targetDate]
    );

    const result = {
      todayAppts: parseInt(todayAppts.rows[0].count),
      completed: parseInt(completed.rows[0].count),
      noShows: parseInt(noShows.rows[0].count),
      revenue: parseFloat(revenue.rows[0].total)
    };
    
    console.log('Metrics result:', result);
    res.json(result);
  } catch (error) {
    console.error('Error obteniendo métricas:', error);
    res.status(500).json({ error: 'Error al obtener métricas' });
  }
});

// =====================================================
// NOTIFICATIONS (Polling fallback)
// =====================================================

// In-memory notification store (temporal)
const notificationStore = new Map();

// Get pending notifications
router.get('/notifications', authenticate, async (req, res) => {
  try {
    const { tenant } = req.query;
    const tenantNotifications = notificationStore.get(tenant) || [];
    res.json({ notifications: tenantNotifications });
  } catch (error) {
    console.error('Error getting notifications:', error);
    res.status(500).json({ error: 'Error al obtener notificaciones' });
  }
});

// Mark notifications as read
router.post('/notifications/mark-read', authenticate, async (req, res) => {
  try {
    const { tenant } = req.body;
    notificationStore.delete(tenant);
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    res.status(500).json({ error: 'Error al marcar notificaciones' });
  }
});

// Helper function to store notification
const storeNotification = (tenantId, notification) => {
  const existing = notificationStore.get(tenantId) || [];
  existing.push(notification);
  notificationStore.set(tenantId, existing);
  // Auto-cleanup after 30 seconds
  setTimeout(() => {
    const current = notificationStore.get(tenantId) || [];
    const filtered = current.filter(n => n.id !== notification.id);
    if (filtered.length === 0) {
      notificationStore.delete(tenantId);
    } else {
      notificationStore.set(tenantId, filtered);
    }
  }, 30000);
};

export { storeNotification };

export default router;