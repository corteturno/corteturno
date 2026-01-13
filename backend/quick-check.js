#!/usr/bin/env node

// quick-check.js
// Script rápido para verificar el estado de las citas

import { query } from './database.js';
import dotenv from 'dotenv';

dotenv.config();

async function quickCheck() {
  console.log('🚀 VERIFICACIÓN RÁPIDA - CITAS');
  console.log('==============================\n');

  try {
    // Verificar conexión
    await query('SELECT 1');
    console.log('✅ Base de datos conectada');

    // Contar registros principales
    const counts = await Promise.all([
      query('SELECT COUNT(*) as count FROM tenants'),
      query('SELECT COUNT(*) as count FROM users'),
      query('SELECT COUNT(*) as count FROM branches'),
      query('SELECT COUNT(*) as count FROM chairs'),
      query('SELECT COUNT(*) as count FROM services'),
      query('SELECT COUNT(*) as count FROM appointments')
    ]);

    console.log('\n📊 RESUMEN DE DATOS:');
    console.log(`   Tenants: ${counts[0].rows[0].count}`);
    console.log(`   Usuarios: ${counts[1].rows[0].count}`);
    console.log(`   Sucursales: ${counts[2].rows[0].count}`);
    console.log(`   Sillas: ${counts[3].rows[0].count}`);
    console.log(`   Servicios: ${counts[4].rows[0].count}`);
    console.log(`   Citas: ${counts[5].rows[0].count}`);

    // Si hay citas, mostrar algunas
    if (parseInt(counts[5].rows[0].count) > 0) {
      console.log('\n📅 ÚLTIMAS CITAS:');
      const recentAppts = await query(`
        SELECT a.client_name, a.appointment_date, a.appointment_time, a.status,
               b.name as branch_name, c.chair_number, s.name as service_name
        FROM appointments a
        JOIN branches b ON a.branch_id = b.id
        JOIN chairs c ON a.chair_id = c.id
        JOIN services s ON a.service_id = s.id
        ORDER BY a.created_at DESC
        LIMIT 5
      `);

      recentAppts.rows.forEach((appt, index) => {
        const date = new Date(appt.appointment_date).toLocaleDateString('es-ES');
        console.log(`   ${index + 1}. ${appt.client_name} | ${date} ${appt.appointment_time} | ${appt.service_name} | Silla ${appt.chair_number} | ${appt.status}`);
      });

      // Citas de hoy
      const today = new Date().toISOString().split('T')[0];
      const todayAppts = await query(`
        SELECT COUNT(*) as count FROM appointments 
        WHERE appointment_date = $1
      `, [today]);
      
      console.log(`\n🗓️ CITAS PARA HOY (${today}): ${todayAppts.rows[0].count}`);
    }

    // Verificar integridad
    console.log('\n🔍 VERIFICACIÓN DE INTEGRIDAD:');
    
    const orphanChecks = await Promise.all([
      query(`SELECT COUNT(*) as count FROM appointments a LEFT JOIN branches b ON a.branch_id = b.id WHERE b.id IS NULL`),
      query(`SELECT COUNT(*) as count FROM appointments a LEFT JOIN chairs c ON a.chair_id = c.id WHERE c.id IS NULL`),
      query(`SELECT COUNT(*) as count FROM appointments a LEFT JOIN services s ON a.service_id = s.id WHERE s.id IS NULL`)
    ]);

    const orphanBranches = parseInt(orphanChecks[0].rows[0].count);
    const orphanChairs = parseInt(orphanChecks[1].rows[0].count);
    const orphanServices = parseInt(orphanChecks[2].rows[0].count);

    if (orphanBranches === 0 && orphanChairs === 0 && orphanServices === 0) {
      console.log('   ✅ Todas las citas tienen referencias válidas');
    } else {
      if (orphanBranches > 0) console.log(`   ❌ ${orphanBranches} citas sin sucursal válida`);
      if (orphanChairs > 0) console.log(`   ❌ ${orphanChairs} citas sin silla válida`);
      if (orphanServices > 0) console.log(`   ❌ ${orphanServices} citas sin servicio válido`);
    }

    console.log('\n✅ Verificación completada');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  process.exit(0);
}

quickCheck();