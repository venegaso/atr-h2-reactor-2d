'use strict';
const express = require('express');
const { listHistory, getHistoryRecord, clearHistory } = require('../db/database');

const router = express.Router();

router.get('/history', (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
  res.json({ history: listHistory(limit) });
});

router.get('/history/:id', (req, res) => {
  const rec = getHistoryRecord(Number(req.params.id));
  if (!rec) return res.status(404).json({ error: 'not_found' });
  return res.json(rec);
});

router.delete('/history', (req, res) => {
  clearHistory();
  res.json({ ok: true });
});

module.exports = router;
