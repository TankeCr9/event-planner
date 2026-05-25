// ══════════════════════════════════════════════════════════════════════════════
//  EVENT PLANNER — BACKEND SERVER (FIXED)
//  Node.js + Express + PostgreSQL
// ══════════════════════════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

// Config
dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';

// PostgreSQL connection
const pool = new Pool({
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'event_planner',
});

// Middleware
app.use(express.json());
app.use(cors());

// ══════════════════════════════════════════════════════════════════════════════
//  SERVIR FRONTEND BÁSICO EN /
// ══════════════════════════════════════════════════════════════════════════════

const htmlTemplate = require('fs').readFileSync(path.join(__dirname, 'index.html'), 'utf8') || `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EventPlanner</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #fdf8f0; 
      color: #3d2e1a;
      padding: 20px;
    }
    .container { max-width: 1000px; margin: 0 auto; }
    header { 
      background: white; 
      padding: 20px; 
      border-radius: 12px; 
      margin-bottom: 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    h1 { color: #c9a84c; font-size: 28px; }
    .hero { text-align: center; padding: 60px 20px; }
    h2 { font-size: 48px; margin-bottom: 20px; }
    p { font-size: 18px; color: #7a6248; margin-bottom: 30px; }
    .buttons { display: flex; gap: 12px; justify-content: center; }
    button { 
      padding: 12px 24px; 
      border-radius: 8px; 
      border: none; 
      cursor: pointer; 
      font-size: 16px;
      font-weight: 600;
    }
    .primary { background: #c9a84c; color: white; }
    .secondary { background: white; border: 1.5px solid #e8dcc8; color: #c9a84c; }
    .status { 
      text-align: center; 
      margin-top: 40px; 
      padding: 20px; 
      background: white; 
      border-radius: 12px;
    }
    .status-ok { color: #7aad8a; }
    .status-error { color: #c4707a; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>✦ EventPlanner</h1>
      <div style="display: flex; gap: 10px;">
        <button class="secondary" onclick="alert('Ir a login')">Ingresar</button>
        <button class="primary" onclick="alert('Ir a registro')">Registrarse</button>
      </div>
    </header>
    
    <div class="hero">
      <h2>✦ EventPlanner</h2>
      <p>Gestiona tu evento de forma fácil.<br/>Invitados, mesas, tareas, proveedores.</p>
      <div class="buttons">
        <button class="primary">Ingresar</button>
        <button class="secondary">Crear cuenta</button>
      </div>
    </div>
    
    <div class="status">
      <p>API Status: <span id="status">Verificando...</span></p>
    </div>
  </div>
  
  <script>
    fetch('/api/health')
      .then(r => r.json())
      .then(d => {
        const el = document.getElementById('status');
        el.textContent = '✅ Funcionando';
        el.className = 'status-ok';
      })
      .catch(e => {
        const el = document.getElementById('status');
        el.textContent = '❌ Error conectando API';
        el.className = 'status-error';
      });
  </script>
</body>
</html>
`;

app.get('/', (req, res) => {
  res.type('text/html').send(htmlTemplate);
});

// ══════════════════════════════════════════════════════════════════════════════
//  AUTH MIDDLEWARE
// ══════════════════════════════════════════════════════════════════════════════

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token inválido' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Solo admin' });
  next();
};

// ══════════════════════════════════════════════════════════════════════════════
//  AUTH ENDPOINTS
// ══════════════════════════════════════════════════════════════════════════════

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role, eventName, eventDate, eventType, category, city, description } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Campos requeridos faltando' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Contraseña mínimo 6 caracteres' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email ya registrado' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const avatar = role === 'client' ? '💍' : '🌸';

    const userRes = await pool.query(
      `INSERT INTO users (name, email, password, role, avatar)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, avatar`,
      [name, email, hashedPassword, role, avatar]
    );

    const user = userRes.rows[0];

    if (role === 'client' && eventName && eventDate) {
      await pool.query(
        `INSERT INTO events (user_id, name, date, type)
         VALUES ($1, $2, $3, $4)`,
        [user.id, eventName, eventDate, eventType || 'Evento']
      );
    }

    if (role === 'vendor') {
      await pool.query(
        `INSERT INTO vendor_profiles (user_id, category, city, description)
         VALUES ($1, $2, $3, $4)`,
        [user.id, category || 'Flores', city || '', description || '']
      );
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      message: 'Usuario registrado',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Error en registro' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      message: 'Login exitoso',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Error en login' });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, email, role, avatar FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    const user = result.rows[0];

    if (user.role === 'client') {
      const eventRes = await pool.query(
        `SELECT id, name, date, type FROM events WHERE user_id = $1 LIMIT 1`,
        [user.id]
      );
      const event = eventRes.rows[0] || null;

      const guestsRes = await pool.query(
        `SELECT id, name, email, status, dietary, table_id
         FROM guests WHERE event_id = (SELECT id FROM events WHERE user_id = $1 LIMIT 1)
         ORDER BY name`,
        [user.id]
      );

      const tablesRes = await pool.query(
        `SELECT id, name, x, y, seats, shape FROM tables WHERE event_id = (SELECT id FROM events WHERE user_id = $1 LIMIT 1)
         ORDER BY name`,
        [user.id]
      );

      const tasksRes = await pool.query(
        `SELECT id, text, done FROM tasks WHERE event_id = (SELECT id FROM events WHERE user_id = $1 LIMIT 1)
         ORDER BY created_at`,
        [user.id]
      );

      return res.json({
        ...user,
        event,
        guests: guestsRes.rows,
        tables: tablesRes.rows,
        tasks: tasksRes.rows,
      });
    }

    if (user.role === 'vendor') {
      const profileRes = await pool.query(
        `SELECT category, phone, city, description, images, instagram, whatsapp
         FROM vendor_profiles WHERE user_id = $1`,
        [user.id]
      );
      const profile = profileRes.rows[0] || {};

      return res.json({
        ...user,
        profile: {
          category: profile.category || 'Flores',
          phone: profile.phone || '',
          city: profile.city || '',
          description: profile.description || '',
          images: profile.images || [],
          instagram: profile.instagram || '',
          whatsapp: profile.whatsapp || '',
        },
      });
    }

    res.json(user);
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Error obteniendo usuario' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  GUEST ENDPOINTS
// ══════════════════════════════════════════════════════════════════════════════

app.post('/api/guests', auth, async (req, res) => {
  try {
    const { name, email, status, dietary } = req.body;
    const eventRes = await pool.query('SELECT id FROM events WHERE user_id = $1 LIMIT 1', [req.user.id]);
    if (eventRes.rows.length === 0) return res.status(404).json({ error: 'Evento no encontrado' });

    const result = await pool.query(
      `INSERT INTO guests (event_id, name, email, status, dietary)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [eventRes.rows[0].id, name, email, status, dietary]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create guest error:', err);
    res.status(500).json({ error: 'Error creando invitado' });
  }
});

app.put('/api/guests/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, status, dietary, table_id } = req.body;

    const result = await pool.query(
      `UPDATE guests SET name = $1, email = $2, status = $3, dietary = $4, table_id = $5
       WHERE id = $6
       RETURNING *`,
      [name, email, status, dietary, table_id, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Invitado no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update guest error:', err);
    res.status(500).json({ error: 'Error actualizando invitado' });
  }
});

app.delete('/api/guests/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM guests WHERE id = $1', [id]);
    res.json({ message: 'Invitado eliminado' });
  } catch (err) {
    console.error('Delete guest error:', err);
    res.status(500).json({ error: 'Error eliminando invitado' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  TABLE ENDPOINTS
// ══════════════════════════════════════════════════════════════════════════════

app.post('/api/tables', auth, async (req, res) => {
  try {
    const { name, x, y, seats, shape } = req.body;
    const eventRes = await pool.query('SELECT id FROM events WHERE user_id = $1 LIMIT 1', [req.user.id]);
    if (eventRes.rows.length === 0) return res.status(404).json({ error: 'Evento no encontrado' });

    const result = await pool.query(
      `INSERT INTO tables (event_id, name, x, y, seats, shape)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [eventRes.rows[0].id, name, x, y, seats, shape]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create table error:', err);
    res.status(500).json({ error: 'Error creando mesa' });
  }
});

app.put('/api/tables/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, x, y, seats, shape } = req.body;

    const result = await pool.query(
      `UPDATE tables SET name = $1, x = $2, y = $3, seats = $4, shape = $5
       WHERE id = $6
       RETURNING *`,
      [name, x, y, seats, shape, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Mesa no encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update table error:', err);
    res.status(500).json({ error: 'Error actualizando mesa' });
  }
});

app.delete('/api/tables/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM tables WHERE id = $1', [id]);
    res.json({ message: 'Mesa eliminada' });
  } catch (err) {
    console.error('Delete table error:', err);
    res.status(500).json({ error: 'Error eliminando mesa' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  TASK ENDPOINTS
// ══════════════════════════════════════════════════════════════════════════════

app.post('/api/tasks', auth, async (req, res) => {
  try {
    const { text } = req.body;
    const eventRes = await pool.query('SELECT id FROM events WHERE user_id = $1 LIMIT 1', [req.user.id]);
    if (eventRes.rows.length === 0) return res.status(404).json({ error: 'Evento no encontrado' });

    const result = await pool.query(
      `INSERT INTO tasks (event_id, text, done)
       VALUES ($1, $2, false)
       RETURNING *`,
      [eventRes.rows[0].id, text]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: 'Error creando tarea' });
  }
});

app.put('/api/tasks/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { text, done } = req.body;

    const result = await pool.query(
      `UPDATE tasks SET text = $1, done = $2 WHERE id = $3 RETURNING *`,
      [text, done, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ error: 'Error actualizando tarea' });
  }
});

app.delete('/api/tasks/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
    res.json({ message: 'Tarea eliminada' });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ error: 'Error eliminando tarea' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  VENDOR ENDPOINTS
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/vendors', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.avatar, vp.category, vp.city, vp.description
       FROM users u
       JOIN vendor_profiles vp ON u.id = vp.user_id
       WHERE u.role = 'vendor'
       ORDER BY u.name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get vendors error:', err);
    res.status(500).json({ error: 'Error obteniendo proveedores' });
  }
});

app.get('/api/vendors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT u.id, u.name, u.avatar, u.email,
              vp.category, vp.phone, vp.city, vp.description, vp.images, vp.instagram, vp.whatsapp
       FROM users u
       JOIN vendor_profiles vp ON u.id = vp.user_id
       WHERE u.id = $1 AND u.role = 'vendor'`,
      [id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get vendor error:', err);
    res.status(500).json({ error: 'Error obteniendo proveedor' });
  }
});

app.put('/api/vendor-profile', auth, async (req, res) => {
  try {
    if (req.user.role !== 'vendor') return res.status(403).json({ error: 'Solo proveedores' });

    const { category, phone, city, description, images, instagram, whatsapp } = req.body;

    const result = await pool.query(
      `UPDATE vendor_profiles
       SET category = $1, phone = $2, city = $3, description = $4, images = $5, instagram = $6, whatsapp = $7
       WHERE user_id = $8
       RETURNING *`,
      [category, phone, city, description, images || [], instagram, whatsapp, req.user.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update vendor profile error:', err);
    res.status(500).json({ error: 'Error actualizando perfil' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  ADMIN ENDPOINTS
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/users', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, avatar, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Error obteniendo usuarios' });
  }
});

app.delete('/api/admin/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.id === parseInt(id)) {
      return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
    }

    await pool.query('DELETE FROM events WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM vendor_profiles WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM users WHERE id = $1', [id]);

    res.json({ message: 'Usuario eliminado' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Error eliminando usuario' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  HEALTH CHECK & START
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Test DB connection and start
pool.query('SELECT NOW()', (err, result) => {
  if (err) {
    console.error('❌ Database connection failed:', err);
    process.exit(1);
  } else {
    console.log('✅ Database connected');
    app.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
    });
  }
});

// Error handling
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

module.exports = app;
