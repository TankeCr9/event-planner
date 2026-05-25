-- ══════════════════════════════════════════════════════════════════
--  EVENT PLANNER — PostgreSQL Schema
--  Run this SQL to set up the database
-- ══════════════════════════════════════════════════════════════════

-- Create database (run once)
-- CREATE DATABASE event_planner;
-- \c event_planner

-- ──────────────────────────────────────────────────────────────────
--  USERS TABLE
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'client', -- client | vendor | admin
  avatar VARCHAR(10),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ──────────────────────────────────────────────────────────────────
--  EVENTS TABLE (para clientes)
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  date DATE,
  type VARCHAR(100), -- Boda, Cumpleaños, etc.
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_events_user_id ON events(user_id);

-- ──────────────────────────────────────────────────────────────────
--  GUESTS TABLE
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guests (
  id SERIAL PRIMARY KEY,
  event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending', -- confirmed | pending | declined
  dietary VARCHAR(100), -- vegetariana | vegana | sin gluten | ninguna
  table_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_guests_event_id ON guests(event_id);
CREATE INDEX idx_guests_status ON guests(status);

-- ──────────────────────────────────────────────────────────────────
--  TABLES (Mesas del salón)
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tables (
  id SERIAL PRIMARY KEY,
  event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  x INT DEFAULT 0,
  y INT DEFAULT 0,
  seats INT DEFAULT 6,
  shape VARCHAR(20) DEFAULT 'round', -- round | rect
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tables_event_id ON tables(event_id);

-- ──────────────────────────────────────────────────────────────────
--  TASKS (Lista de tareas del cliente)
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  text VARCHAR(500) NOT NULL,
  done BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tasks_event_id ON tasks(event_id);

-- ──────────────────────────────────────────────────────────────────
--  VENDOR_PROFILES (Perfil de proveedores)
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_profiles (
  id SERIAL PRIMARY KEY,
  user_id INT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category VARCHAR(100), -- Catering, Flores, Fotografía, etc.
  phone VARCHAR(20),
  city VARCHAR(100),
  description TEXT,
  images TEXT[], -- Array de emojis o URLs
  instagram VARCHAR(100),
  whatsapp VARCHAR(20),
  rating DECIMAL(3,2) DEFAULT 5.0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vendor_profiles_user_id ON vendor_profiles(user_id);
CREATE INDEX idx_vendor_profiles_category ON vendor_profiles(category);

-- ──────────────────────────────────────────────────────────────────
--  SEED DATA (opcional, para testing)
-- ──────────────────────────────────────────────────────────────────

-- Agregar admin (password será hasheado en el servidor)
-- INSERT INTO users (name, email, password, role, avatar)
-- VALUES ('Admin', 'admin@planner.com', '$2a$10$...', 'admin', '👑');

-- ──────────────────────────────────────────────────────────────────
--  FUNCIONES DE TRIGGER (opcional, para auditoría)
-- ──────────────────────────────────────────────────────────────────

-- Actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar triggers
CREATE TRIGGER update_users_timestamp BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_events_timestamp BEFORE UPDATE ON events
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_guests_timestamp BEFORE UPDATE ON guests
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_tables_timestamp BEFORE UPDATE ON tables
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_tasks_timestamp BEFORE UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_vendor_profiles_timestamp BEFORE UPDATE ON vendor_profiles
FOR EACH ROW EXECUTE FUNCTION update_timestamp();
