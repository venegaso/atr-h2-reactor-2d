'use strict';
const express = require('express');
const cors = require('cors');

const simulateRouter = require('./src/routes/simulate');
const catalystsRouter = require('./src/routes/catalysts');
const historyRouter = require('./src/routes/history');
const sensitivityRouter = require('./src/routes/sensitivity');
const inverseYieldRouter = require('./src/routes/inverseYield');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'atr-h2-reactor-2d-backend', time: new Date().toISOString() });
});

app.use('/api', simulateRouter);
app.use('/api', catalystsRouter);
app.use('/api', historyRouter);
app.use('/api', sensitivityRouter);
app.use('/api', inverseYieldRouter);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: 'internal_error', message: err.message });
});

// Se especifica '0.0.0.0' para que Render pueda enrutar el tráfico externo al contenedor
app.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`ATR H2 Reactor 2D backend escuchando en el puerto ${PORT}`);
});

module.exports = app;