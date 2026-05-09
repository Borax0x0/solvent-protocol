import { adminKeypair } from './config.js';

export interface DriftPosition {
  collateralSol: number;
  unrealizedPnlUsd: number;
  fundingPnlSinceLastAccrual: number;
  health: number;
  shortNotionalSol: number;
  hasPosition: boolean;
}

const MOCK_INITIAL_COLLATERAL = 0;
const MOCK_FUNDING_PER_INTERVAL_USD = 0.05;

let mockCollateralSol = MOCK_INITIAL_COLLATERAL;
let mockShortNotionalSol = 0;
let mockCumulativeFundingUsd = 0;
let mockLastAccrualFundingUsd = 0;
let initialized = false;

export async function initDriftClient(): Promise<void> {
  if (initialized) return;
  console.log('[drift-mock] Initializing mock Drift client');
  initialized = true;
}

export async function createDriftUserAccount(): Promise<void> {
  console.log('[drift-mock] Creating mock Drift user account (no-op)');
}

export async function depositToDrift(lamports: number): Promise<void> {
  mockCollateralSol += lamports / 1e9;
  console.log(`[drift-mock] Deposited ${lamports / 1e9} SOL. Total collateral: ${mockCollateralSol.toFixed(4)} SOL`);
}

export async function openSolPerpShort(notionalSol: number): Promise<void> {
  mockShortNotionalSol += notionalSol;
  console.log(`[drift-mock] Opened SOL-PERP short for ${notionalSol.toFixed(4)} SOL notional. Total short: ${mockShortNotionalSol.toFixed(4)} SOL`);
}

export async function withdrawFromDrift(lamports: number): Promise<void> {
  const sol = lamports / 1e9;
  mockCollateralSol = Math.max(0, mockCollateralSol - sol);
  console.log(`[drift-mock] Withdrew ${sol} SOL. Remaining collateral: ${mockCollateralSol.toFixed(4)} SOL`);
}

export async function getDriftPosition(): Promise<DriftPosition> {
  const fundingSinceLast = mockCumulativeFundingUsd - mockLastAccrualFundingUsd;
  const health = mockCollateralSol > 0 && mockShortNotionalSol > 0
    ? mockCollateralSol / mockShortNotionalSol * 2
    : 3.0;

  return {
    collateralSol: mockCollateralSol,
    unrealizedPnlUsd: mockCumulativeFundingUsd,
    fundingPnlSinceLastAccrual: fundingSinceLast,
    health,
    shortNotionalSol: mockShortNotionalSol,
    hasPosition: mockShortNotionalSol > 0,
  };
}

export function markFundingAccrued(): void {
  mockLastAccrualFundingUsd = mockCumulativeFundingUsd;
}

export function simulateFundingAccrual(): void {
  if (mockShortNotionalSol > 0) {
    mockCumulativeFundingUsd += MOCK_FUNDING_PER_INTERVAL_USD;
  }
}

export function getUndeployedSol(): number {
  return 0;
}
