'use strict';
const express = require('express');
const { CATALYST_LIST } = require('../kinetics/catalysts');
const { getCatalystCatalog, getReactionCatalog } = require('../db/database');

const router = express.Router();

router.get('/catalysts', (req, res) => {
  res.json({ catalysts: CATALYST_LIST });
});

router.get('/catalysts/catalog', (req, res) => {
  res.json({ catalysts: getCatalystCatalog(), reactions: getReactionCatalog() });
});

module.exports = router;
