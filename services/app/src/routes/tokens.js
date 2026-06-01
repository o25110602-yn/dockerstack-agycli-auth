'use strict';

const express = require('express');
const firebase = require('../services/firebaseService');

const router = express.Router();

function isValidTokenKey(key) {
  return typeof key === 'string'
    && key.length > 0
    && key.length <= 256
    && !/[.#$\[\]\/]/.test(key);
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

router.get('/', async (_req, res) => {
  try {
    const list = await firebase.listTokens();
    res.json({ count: list.length, tokens: list });
  } catch (err) {
    console.error(`✗  [TOKENS] list failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

router.get('/export/excel', async (_req, res) => {
  try {
    const tokens = await firebase.listTokens();
    const rows = tokens.map((t) => `
      <Row>
        <Cell><Data ss:Type="String">${xmlEscape(t.email || '—')}</Data></Cell>
        <Cell><Data ss:Type="String">${xmlEscape(t.key || '—')}</Data></Cell>
        <Cell><Data ss:Type="String">${xmlEscape(t.createdAt || '')}</Data></Cell>
        <Cell><Data ss:Type="String">${xmlEscape(t.updatedAt || '')}</Data></Cell>
      </Row>`).join('');

    const xml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Tokens">
    <Table>
      <Row>
        <Cell><Data ss:Type="String">Email</Data></Cell>
        <Cell><Data ss:Type="String">Key</Data></Cell>
        <Cell><Data ss:Type="String">Created</Data></Cell>
        <Cell><Data ss:Type="String">Updated</Data></Cell>
      </Row>${rows}
    </Table>
  </Worksheet>
</Workbook>`;

    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="tokens-${Date.now()}.xls"`);
    res.send(xml);
  } catch (err) {
    console.error(`✗  [TOKENS] export excel failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

router.get('/backup', async (_req, res) => {
  try {
    const tokens = await firebase.exportTokensBackup();
    res.json({ exportedAt: Date.now(), tokens });
  } catch (err) {
    console.error(`✗  [TOKENS] backup failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

router.post('/restore', async (req, res) => {
  try {
    const restored = await firebase.restoreTokensBackup(req.body?.tokens || {});
    res.json({ restored });
  } catch (err) {
    console.error(`✗  [TOKENS] restore failed: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

router.get('/:key', async (req, res) => {
  const { key } = req.params;
  if (!isValidTokenKey(key)) {
    return res.status(400).json({ error: 'Invalid token key' });
  }

  try {
    const token = await firebase.getTokenDetail(key);
    if (!token) return res.status(404).json({ error: 'Token not found' });
    res.json({ token });
  } catch (err) {
    console.error(`✗  [TOKENS] detail failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
