"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAudit = createAudit;
const prisma_1 = __importDefault(require("../prisma"));
async function createAudit(params) {
    const { action, entity_type, user_id, ip_address } = params;
    return prisma_1.default.auditLog.create({
        data: {
            action: action || '',
            entityType: entity_type || null,
            ipAddress: ip_address || null,
            userId: user_id ?? null,
        },
    });
}
exports.default = createAudit;
