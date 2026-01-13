-- Agregar campos de suscripción a la tabla users
ALTER TABLE users 
ADD COLUMN subscription_plan VARCHAR(20) DEFAULT 'free',
ADD COLUMN subscription_expires_at TIMESTAMP NULL,
ADD COLUMN stripe_customer_id VARCHAR(255) NULL;

-- Crear índice para búsquedas por customer_id
CREATE INDEX idx_users_stripe_customer_id ON users(stripe_customer_id);