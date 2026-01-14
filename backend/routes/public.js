// routes/public.js

import express from 'express';
import { query } from '../database.js';
import { storeNotification } from './index.js';

const router = express.Router();

// Get branch info for public booking
router.get('/branch/:branchId', async (req, res) => {
  try {
    const { branchId } = req.params;
    
    const branchResult = await query(
      `SELECT b.*, t.shop_name,
        json_agg(json_build_object('id', c.id, 'chair_number', c.chair_number, 'commission', c.commission) ORDER BY c.chair_number) as chairs
       FROM branches b
       JOIN tenants t ON b.tenant_id = t.id
       LEFT JOIN chairs c ON b.id = c.branch_id
       WHERE b.id = $1
       GROUP BY b.id, t.shop_name`,
      [branchId]
    );

    if (branchResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sucursal no encontrada' });
    }

    res.json(branchResult.rows[0]);
  } catch (error) {
    console.error('Error obteniendo sucursal:', error);
    res.status(500).json({ error: 'Error al obtener información de la sucursal' });
  }
});

// Get services for public booking
router.get('/services/:branchId', async (req, res) => {
  try {
    const { branchId } = req.params;
    
    // Get tenant_id from branch
    const branchResult = await query('SELECT tenant_id FROM branches WHERE id = $1', [branchId]);
    if (branchResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sucursal no encontrada' });
    }
    
    const tenantId = branchResult.rows[0].tenant_id;
    
    const servicesResult = await query(
      'SELECT * FROM services WHERE tenant_id = $1 ORDER BY created_at',
      [tenantId]
    );
    
    res.json(servicesResult.rows);
  } catch (error) {
    console.error('Error obteniendo servicios:', error);
    res.status(500).json({ error: 'Error al obtener servicios' });
  }
});

// Get available times for public booking
router.get('/available-times', async (req, res) => {
  try {
    const { date, branchId, chairId, serviceId } = req.query;
    
    if (!date || !branchId || !chairId || !serviceId) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos' });
    }

    // Get branch info
    const branchResult = await query(
      'SELECT work_days, start_time, end_time, lunch_start, lunch_end FROM branches WHERE id = $1',
      [branchId]
    );

    if (branchResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sucursal no encontrada' });
    }

    const branch = branchResult.rows[0];
    
    // Check if it's a work day
    const requestDate = new Date(date + 'T12:00:00'); // Use noon to avoid timezone issues
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const dayName = dayNames[requestDate.getDay()];
    
    console.log('Date:', date, 'Day index:', requestDate.getDay(), 'Day name:', dayName, 'Work days:', branch.work_days);
    
    if (!branch.work_days || !branch.work_days.includes(dayName)) {
      console.log('Not a work day, returning empty slots');
      return res.json([]);
    }

    // Get service duration
    const serviceResult = await query('SELECT duration FROM services WHERE id = $1', [serviceId]);
    if (serviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }

    const serviceDuration = serviceResult.rows[0].duration || 30;

    // Get existing appointments
    const appointmentsResult = await query(
      `SELECT a.appointment_time, s.duration 
       FROM appointments a
       JOIN services s ON a.service_id = s.id
       WHERE a.chair_id = $1 AND a.appointment_date = $2 AND a.status = 'scheduled'`,
      [chairId, date]
    );

    const existingAppointments = appointmentsResult.rows;

    // Generate available time slots
    const timeSlots = [];
    const startTime = branch.start_time;
    const endTime = branch.end_time;
    const lunchStart = branch.lunch_start;
    const lunchEnd = branch.lunch_end;

    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    const [lunchStartHour, lunchStartMin] = lunchStart ? lunchStart.split(':').map(Number) : [0, 0];
    const [lunchEndHour, lunchEndMin] = lunchEnd ? lunchEnd.split(':').map(Number) : [0, 0];

    let currentTime = startHour * 60 + startMin;
    const endTimeMinutes = endHour * 60 + endMin;
    const lunchStartMinutes = lunchStart ? lunchStartHour * 60 + lunchStartMin : null;
    const lunchEndMinutes = lunchEnd ? lunchEndHour * 60 + lunchEndMin : null;

    // Get current time if date is today (using local timezone)
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + 
                    String(today.getMonth() + 1).padStart(2, '0') + '-' + 
                    String(today.getDate()).padStart(2, '0');
    const isToday = date === todayStr;
    
    console.log('Date comparison:', {
      requestedDate: date,
      todayStr: todayStr,
      isToday: isToday,
      todayObject: today
    });
    
    let minTimeMinutes = currentTime;
    
    if (isToday) {
      const currentHour = today.getHours();
      const currentMinute = today.getMinutes();
      const nowMinutes = currentHour * 60 + currentMinute;
      
      // Add 30 minutes buffer for next available slot
      const nextAvailableMinutes = nowMinutes + 30;
      
      // Round up to next 30-minute slot
      const roundedMinutes = Math.ceil(nextAvailableMinutes / 30) * 30;
      
      minTimeMinutes = Math.max(currentTime, roundedMinutes);
    }

    currentTime = minTimeMinutes;
    
    console.log('Time calculation:', {
      startTime,
      endTime,
      currentTime,
      minTimeMinutes,
      serviceDuration,
      isToday,
      endTimeMinutes
    });
    
    while (currentTime + serviceDuration <= endTimeMinutes) {
      const hour = Math.floor(currentTime / 60);
      const minute = currentTime % 60;
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      
      // Check if it's lunch time
      const isLunchTime = lunchStartMinutes && lunchEndMinutes && 
        currentTime >= lunchStartMinutes && currentTime < lunchEndMinutes;
      
      // Check for conflicts with existing appointments
      const hasConflict = existingAppointments.some(appt => {
        const [apptHour, apptMin] = appt.appointment_time.split(':').map(Number);
        const apptStartMinutes = apptHour * 60 + apptMin;
        const apptDuration = appt.duration || 30;
        const apptEndMinutes = apptStartMinutes + apptDuration;
        
        return (currentTime < apptEndMinutes && currentTime + serviceDuration > apptStartMinutes);
      });

      if (!isLunchTime && !hasConflict) {
        timeSlots.push({
          time: timeString,
          display: timeString,
          available: true
        });
      }

      currentTime += 30;
    }

    console.log('Generated time slots:', timeSlots.length, timeSlots);
    res.json(timeSlots);
  } catch (error) {
    console.error('Error obteniendo horarios disponibles:', error);
    res.status(500).json({ error: 'Error al obtener horarios disponibles' });
  }
});

// Create public booking
router.post('/book', async (req, res) => {
  try {
    console.log('=== PUBLIC BOOKING REQUEST ===');
    console.log('Body:', req.body);
    
    const { branchId, chairId, serviceId, clientName, clientPhone, date, time } = req.body;

    // Validar datos requeridos
    if (!branchId || !chairId || !serviceId || !clientName || !clientPhone || !date || !time) {
      console.log('Missing required fields');
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    // Get tenant_id from branch
    const branchResult = await query('SELECT tenant_id FROM branches WHERE id = $1', [branchId]);
    if (branchResult.rows.length === 0) {
      console.log('Branch not found:', branchId);
      return res.status(404).json({ error: 'Sucursal no encontrada' });
    }
    
    const tenantId = branchResult.rows[0].tenant_id;
    console.log('Found tenant:', tenantId);

    // Check if slot is still available
    const existing = await query(
      `SELECT id FROM appointments 
       WHERE chair_id = $1 AND appointment_date = $2 AND appointment_time = $3 AND status = 'scheduled'`,
      [chairId, date, time]
    );

    if (existing.rows.length > 0) {
      console.log('Slot already taken');
      return res.status(400).json({ error: 'Este horario ya no está disponible' });
    }

    // Create appointment
    console.log('Creating appointment...');
    const result = await query(
      `INSERT INTO appointments 
       (tenant_id, branch_id, chair_id, service_id, client_name, client_phone, appointment_date, appointment_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [tenantId, branchId, chairId, serviceId, clientName, clientPhone, date, time]
    );
    
    console.log('Appointment created:', result.rows[0]);

    // Get service and chair info for notification
    try {
      const notificationData = await query(
        `SELECT s.name as service_name, c.chair_number, b.name as branch_name
         FROM services s, chairs c, branches b
         WHERE s.id = $1 AND c.id = $2 AND b.id = $3`,
        [serviceId, chairId, branchId]
      );

      console.log('Notification data:', notificationData.rows);

      // Emit real-time notification via Socket.IO
      if (req.app.get('io') && notificationData.rows.length > 0) {
        const notification = {
          id: Date.now().toString(),
          type: 'public_booking',
          tenantId,
          branchId,
          chairId,
          data: {
            clientName,
            clientPhone,
            serviceName: notificationData.rows[0].service_name,
            chairNumber: notificationData.rows[0].chair_number,
            branchName: notificationData.rows[0].branch_name,
            date,
            time
          }
        };
        
        console.log('🔔 Emitting new booking notification:', {
          type: notification.type,
          client: clientName,
          branch: branchId,
          tenant: tenantId
        });
        
        // Emit to specific branch room (most targeted)
        req.app.get('io').to(`branch-${branchId}`).emit('notification', notification);
        // Also emit to tenant room as backup
        req.app.get('io').to(`tenant-${tenantId}`).emit('notification', notification);
        // Also emit to all connected clients as final backup
        req.app.get('io').emit('notification', notification);
        
        console.log('✅ Notification emitted to branch, tenant, and all clients');
        console.log('📊 Connected clients:', req.app.get('io').engine.clientsCount);
      }
    } catch (notificationError) {
      console.error('Error sending notification (non-critical):', notificationError);
      // No fallar la cita por un error de notificación
    }

    res.status(201).json({ 
      success: true, 
      appointment: result.rows[0],
      message: 'Cita creada exitosamente'
    });
  } catch (error) {
    console.error('Error creando cita pública:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ error: 'Error al crear la cita: ' + error.message });
  }
});

// Get client appointments by phone
router.get('/appointments', async (req, res) => {
  try {
    const { phone, branchId, chairId } = req.query;
    
    if (!phone || !branchId || !chairId) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos' });
    }

    const appointments = await query(
      `SELECT a.*, s.name as service_name, s.duration, s.price
       FROM appointments a
       JOIN services s ON a.service_id = s.id
       WHERE a.client_phone = $1 AND a.branch_id = $2 AND a.chair_id = $3 AND a.status = 'scheduled'
       ORDER BY a.appointment_date, a.appointment_time`,
      [phone, branchId, chairId]
    );
    
    res.json(appointments.rows);
  } catch (error) {
    console.error('Error obteniendo citas del cliente:', error);
    res.status(500).json({ error: 'Error al obtener citas' });
  }
});

// Reschedule client appointment
router.patch('/reschedule/:appointmentId', async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { date, time } = req.body;

    // Update appointment
    const result = await query(
      `UPDATE appointments 
       SET appointment_date = $1, appointment_time = $2
       WHERE id = $3 AND status = 'scheduled' RETURNING *`,
      [date, time, appointmentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    // Get appointment details for notification
    const apptData = await query(
      `SELECT a.*, s.name as service_name, c.chair_number, b.name as branch_name
       FROM appointments a
       JOIN services s ON a.service_id = s.id
       JOIN chairs c ON a.chair_id = c.id
       JOIN branches b ON a.branch_id = b.id
       WHERE a.id = $1`,
      [appointmentId]
    );

    // Emit real-time notification via Socket.IO
    if (req.app.get('io') && apptData.rows.length > 0) {
      const notification = {
        id: Date.now().toString(),
        type: 'appointment_rescheduled',
        tenantId: apptData.rows[0].tenant_id,
        branchId: apptData.rows[0].branch_id,
        chairId: apptData.rows[0].chair_id,
        data: {
          clientName: apptData.rows[0].client_name,
          clientPhone: apptData.rows[0].client_phone,
          serviceName: apptData.rows[0].service_name,
          chairNumber: apptData.rows[0].chair_number,
          branchName: apptData.rows[0].branch_name,
          date,
          time,
          action: 'reagendada'
        }
      };
      
      console.log('📅 Emitting reschedule notification:', {
        type: notification.type,
        client: apptData.rows[0].client_name,
        branch: apptData.rows[0].branch_id,
        tenant: apptData.rows[0].tenant_id
      });
      
      // Emit to specific branch room (most targeted)
      req.app.get('io').to(`branch-${apptData.rows[0].branch_id}`).emit('notification', notification);
      // Also emit to tenant room as backup
      req.app.get('io').to(`tenant-${apptData.rows[0].tenant_id}`).emit('notification', notification);
      // Also emit to all connected clients as final backup
      req.app.get('io').emit('notification', notification);
      
      console.log('✅ Reschedule notification emitted to branch, tenant, and all clients');
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error reagendando cita:', error);
    res.status(500).json({ error: 'Error al reagendar cita' });
  }
});

// Cancel client appointment
router.delete('/cancel/:appointmentId', async (req, res) => {
  try {
    const { appointmentId } = req.params;

    // Get appointment details before deletion for notification
    const apptData = await query(
      `SELECT a.*, s.name as service_name, c.chair_number, b.name as branch_name
       FROM appointments a
       JOIN services s ON a.service_id = s.id
       JOIN chairs c ON a.chair_id = c.id
       JOIN branches b ON a.branch_id = b.id
       WHERE a.id = $1 AND a.status = 'scheduled'`,
      [appointmentId]
    );

    if (apptData.rows.length === 0) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    // Delete appointment
    await query('DELETE FROM appointments WHERE id = $1', [appointmentId]);

    // Emit real-time notification via Socket.IO
    if (req.app.get('io')) {
      const notification = {
        id: Date.now().toString(),
        type: 'appointment_cancelled',
        tenantId: apptData.rows[0].tenant_id,
        branchId: apptData.rows[0].branch_id,
        chairId: apptData.rows[0].chair_id,
        data: {
          clientName: apptData.rows[0].client_name,
          clientPhone: apptData.rows[0].client_phone,
          serviceName: apptData.rows[0].service_name,
          chairNumber: apptData.rows[0].chair_number,
          branchName: apptData.rows[0].branch_name,
          date: apptData.rows[0].appointment_date.split('T')[0],
          time: apptData.rows[0].appointment_time,
          action: 'cancelada'
        }
      };
      
      console.log('❌ Emitting cancellation notification:', {
        type: notification.type,
        client: apptData.rows[0].client_name,
        branch: apptData.rows[0].branch_id,
        tenant: apptData.rows[0].tenant_id
      });
      
      // Emit to specific branch room (most targeted)
      req.app.get('io').to(`branch-${apptData.rows[0].branch_id}`).emit('notification', notification);
      // Also emit to tenant room as backup
      req.app.get('io').to(`tenant-${apptData.rows[0].tenant_id}`).emit('notification', notification);
      // Also emit to all connected clients as final backup
      req.app.get('io').emit('notification', notification);
      
      console.log('✅ Cancellation notification emitted to branch, tenant, and all clients');
    }

    res.json({ message: 'Cita cancelada exitosamente' });
  } catch (error) {
    console.error('Error cancelando cita:', error);
    res.status(500).json({ error: 'Error al cancelar cita' });
  }
});

export default router;