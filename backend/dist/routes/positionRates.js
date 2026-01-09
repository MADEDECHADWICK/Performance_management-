"use strict";
// DEPRECATED: Position rates are now managed through the Role system.
// See src/routes/roles.ts for the new role-based rate management.
// This file is preserved as a stub to avoid breaking imports if any exist.
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
// Stub endpoints that return deprecation message
router.get('/', (req, res) => {
    res.status(410).json({
        error: 'Position rates endpoint is deprecated',
        message: 'Use /roles endpoint instead for rate management'
    });
});
router.get('/:id', (req, res) => {
    res.status(410).json({
        error: 'Position rates endpoint is deprecated',
        message: 'Use /roles endpoint instead for rate management'
    });
});
router.post('/', (req, res) => {
    res.status(410).json({
        error: 'Position rates endpoint is deprecated',
        message: 'Use /roles endpoint instead for rate management'
    });
});
router.patch('/:id', (req, res) => {
    res.status(410).json({
        error: 'Position rates endpoint is deprecated',
        message: 'Use /roles endpoint instead for rate management'
    });
});
router.delete('/:id', (req, res) => {
    res.status(410).json({
        error: 'Position rates endpoint is deprecated',
        message: 'Use /roles endpoint instead for rate management'
    });
});
exports.default = router;
