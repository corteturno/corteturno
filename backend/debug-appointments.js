// debug-appointments.js
// Script para diagnosticar problemas con las citas

import { query } from './database.js';
import dotenv from 'dotenv';

dotenv.config();

async function debugAppointments() {
  console.log('🔍 DIAGNÓSTICO DE CITAS - BARBEROS APP');
  console.log('=====================================\n');

  try {
    // 1. Verificar conexión a la base de datos
    console.log('1️⃣ Verificando conexión a la base de datos...');
    const dbTest = await query('SELECT NOW() as current_time');
    console.log('✅ Conexión exitosa:', dbTest.rows[0].current_time);
    console.log();

    // 2. Verificar estructura de tablas
    console.log('2️⃣ Verificando estructura de tablas...');
    
    const tables = ['tenants', 'users', 'branches', 'chairs', 'services', 'appointments'];
    for (const table of tables) {
      const result = await query(`SELECT COUNT(*) as count FROM ${table}`);
      console.log(`📊 ${table}: ${result.rows[0].count} registros`);
    }
    console.log();

    // 3. Verificar tenants
    console.log('3️⃣ Verificando tenants...');
    const tenants = await query('SELECT id, shop_name, created_at FROM tenants ORDER BY created_at');
    if (tenants.rows.length === 0) {
      console.log('❌ No hay tenants registrados');
      return;
    }
    
    tenants.rows.forEach((tenant, index) => {
      console.log(`🏢 Tenant ${index + 1}: ${tenant.shop_name} (ID: ${tenant.id})`);
    });
    console.log();

    // 4. Para cada tenant, verificar sus datos
    for (const tenant of tenants.rows) {
      console.log(`🔍 Analizando tenant: ${tenant.shop_name}`);
      console.log('─'.repeat(50));

      // Usuarios
      const users = await query('SELECT id, name, email, role FROM users WHERE tenant_id = $1', [tenant.id]);
      console.log(`👥 Usuarios: ${users.rows.length}`);
      users.rows.forEach(user => {
        console.log(`   - ${user.name} (${user.email}) - ${user.role}`);
      });

      // Sucursales
      const branches = await query('SELECT id, name, work_days, start_time, end_time FROM branches WHERE tenant_id = $1', [tenant.id]);
      console.log(`🏪 Sucursales: ${branches.rows.length}`);
      
      for (const branch of branches.rows) {
        console.log(`   - ${branch.name} (ID: ${branch.id})`);
        console.log(`     Horario: ${branch.start_time} - ${branch.end_time}`);
        console.log(`     Días: ${branch.work_days ? branch.work_days.join(', ') : 'No definidos'}`);

        // Sillas por sucursal
        const chairs = await query('SELECT id, chair_number, commission FROM chairs WHERE branch_id = $1 ORDER BY chair_number', [branch.id]);
        console.log(`     🪑 Sillas: ${chairs.rows.length}`);
        chairs.rows.forEach(chair => {
          console.log(`       - Silla ${chair.chair_number} (ID: ${chair.id}, Comisión: ${chair.commission}%)`);
        });
      }

      // Servicios
      const services = await query('SELECT id, name, price, duration FROM services WHERE tenant_id = $1', [tenant.id]);
      console.log(`✂️ Servicios: ${services.rows.length}`);
      services.rows.forEach(service => {
        console.log(`   - ${service.name}: $${service.price} (${service.duration} min) - ID: ${service.id}`);
      });

      // Citas
      const appointments = await query(`
        SELECT a.*, b.name as branch_name, c.chair_number, s.name as service_name
        FROM appointments a
        JOIN branches b ON a.branch_id = b.id
        JOIN chairs c ON a.chair_id = c.id
        JOIN services s ON a.service_id = s.id
        WHERE a.tenant_id = $1
        ORDER BY a.appointment_date DESC, a.appointment_time ASC
      `, [tenant.id]);
      
      console.log(`📅 Citas totales: ${appointments.rows.length}`);
      
      if (appointments.rows.length > 0) {
        console.log('   Últimas 5 citas:');
        appointments.rows.slice(0, 5).forEach(appt => {
          const date = new Date(appt.appointment_date).toLocaleDateString('es-ES');
          console.log(`   - ${appt.client_name} | ${date} ${appt.appointment_time} | ${appt.service_name} | Silla ${appt.chair_number} | ${appt.status}`);
        });

        // Citas por fecha
        const today = new Date().toISOString().split('T')[0];
        const todayAppts = await query(`
          SELECT COUNT(*) as count FROM appointments 
          WHERE tenant_id = $1 AND appointment_date = $2
        `, [tenant.id, today]);
        console.log(`   📊 Citas para hoy (${today}): ${todayAppts.rows[0].count}`);

        // Citas por sucursal
        for (const branch of branches.rows) {
          const branchAppts = await query(`
            SELECT COUNT(*) as count FROM appointments 
            WHERE tenant_id = $1 AND branch_id = $2
          `, [tenant.id, branch.id]);
          console.log(`   📊 Citas en ${branch.name}: ${branchAppts.rows[0].count}`);
        }
      } else {
        console.log('   ⚠️ No hay citas registradas para este tenant');
      }

      console.log();
    }

    // 5. Verificar problemas comunes
    console.log('5️⃣ Verificando problemas comunes...');
    
    // Citas huérfanas (sin sucursal válida)
    const orphanAppts = await query(`
      SELECT COUNT(*) as count FROM appointments a
      LEFT JOIN branches b ON a.branch_id = b.id
      WHERE b.id IS NULL
    `);
    if (orphanAppts.rows[0].count > 0) {
      console.log(`❌ Citas huérfanas (sin sucursal): ${orphanAppts.rows[0].count}`);
    }

    // Citas sin silla válida
    const noChairAppts = await query(`
      SELECT COUNT(*) as count FROM appointments a
      LEFT JOIN chairs c ON a.chair_id = c.id
      WHERE c.id IS NULL
    `);
    if (noChairAppts.rows[0].count > 0) {
      console.log(`❌ Citas sin silla válida: ${noChairAppts.rows[0].count}`);
    }

    // Citas sin servicio válido
    const noServiceAppts = await query(`
      SELECT COUNT(*) as count FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      WHERE s.id IS NULL
    `);
    if (noServiceAppts.rows[0].count > 0) {
      console.log(`❌ Citas sin servicio válido: ${noServiceAppts.rows[0].count}`);
    }

    console.log('✅ Diagnóstico completado');

  } catch (error) {
    console.error('❌ Error durante el diagnóstico:', error);
  }
}

// Ejecutar diagnóstico
debugAppointments().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('Error fatal:', error);
  process.exit(1);
});