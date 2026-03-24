/**
 * Economy Engine — Self-regulating token economy for Misaka Network
 *
 * Ported from AgentMarket's EconomyEngine. Pure calculation logic,
 * no database dependency. Storage is handled by the caller.
 *
 * Core Formula:
 *   σ (sigma) = Σ(active node balances) / (active nodes × TARGET_PER_NODE)
 *
 *   R(σ) = R_BASE × (2 - σ)  clamped to [R_MIN, R_MAX]   — daily regeneration
 *   B(σ) = B_BASE × σ        clamped to [B_MIN, B_MAX]    — burn rate per tx
 *
 * When σ < 1: R↑ B↓ → inflate to equilibrium
 * When σ > 1: R↓ B↑ → deflate to equilibrium
 */

// ============================================
// Configuration
// ============================================

export const ECONOMY = {
  // Daily regeneration base (at σ = 1.0)
  R_BASE: 20,

  // Burn rate base (at σ = 1.0, 25%)
  B_BASE: 0.25,

  // Target MP per active node
  TARGET_PER_NODE: 150,

  // Daily regeneration limits
  R_MIN: 5,
  R_MAX: 40,

  // Burn rate limits
  B_MIN: 0.10,
  B_MAX: 0.40,

  // Nodes with balance >= cap don't receive daily regen
  BALANCE_CAP: 200,

  // EMA smoothing: σ_new = α × σ_raw + (1-α) × σ_old
  ALPHA: 0.3,

  // Registration bonuses
  NODE_REGISTRATION_BONUS: 100,

  // Rewards
  TASK_COMPLETION_BONUS: 20,
  JUDGE_REWARD: 10,

  // Newbie protection
  NEWBIE_DAYS: 3,
  NEWBIE_REGEN_MULTIPLIER: 0.5,

  // Active node definition (activity within N days)
  ACTIVE_WINDOW_DAYS: 7,

  // Health thresholds
  SIGMA_HEALTHY_MIN: 0.7,
  SIGMA_HEALTHY_MAX: 1.3,
}

// ============================================
// Pure calculation functions
// ============================================

/**
 * Calculate raw supply ratio (σ)
 */
export function calcSupplyRatio(totalActiveMP, activeNodes) {
  if (activeNodes <= 0) return 1.0
  return totalActiveMP / (activeNodes * ECONOMY.TARGET_PER_NODE)
}

/**
 * Apply EMA smoothing to sigma
 */
export function smoothSigma(sigmaRaw, sigmaPrev) {
  if (sigmaPrev === null || sigmaPrev === undefined) return sigmaRaw
  return ECONOMY.ALPHA * sigmaRaw + (1 - ECONOMY.ALPHA) * sigmaPrev
}

/**
 * Calculate daily regeneration from sigma
 * R(σ) = R_BASE × (2 - σ), clamped to [R_MIN, R_MAX]
 */
export function calculateDailyRegen(sigma) {
  const r = ECONOMY.R_BASE * (2 - sigma)
  return Math.max(ECONOMY.R_MIN, Math.min(ECONOMY.R_MAX, Math.round(r)))
}

/**
 * Calculate burn rate from sigma
 * B(σ) = B_BASE × σ, clamped to [B_MIN, B_MAX]
 */
export function calculateBurnRate(sigma) {
  const b = ECONOMY.B_BASE * sigma
  return Math.max(ECONOMY.B_MIN, Math.min(ECONOMY.B_MAX, b))
}

/**
 * Calculate settlement: how much the agent gets, how much is burned
 */
export function calculateSettlement(taskValue, sigma) {
  const burnRate = calculateBurnRate(sigma)
  const burned = Math.round(taskValue * burnRate * 100) / 100
  const agentGets = taskValue - burned
  return { agentGets, burned, burnRate }
}

/**
 * Get economy health status
 */
export function getEconomyStatus(sigma) {
  if (sigma < ECONOMY.SIGMA_HEALTHY_MIN) return 'deflated'
  if (sigma > ECONOMY.SIGMA_HEALTHY_MAX) return 'inflated'
  return 'healthy'
}

/**
 * Calculate full economy snapshot from network metrics
 */
export function getEconomySnapshot(totalActiveMP, activeNodes, sigmaPrev = null) {
  const sigmaRaw = calcSupplyRatio(totalActiveMP, activeNodes)
  const sigma = smoothSigma(sigmaRaw, sigmaPrev)
  const R = calculateDailyRegen(sigma)
  const B = calculateBurnRate(sigma)

  return {
    sigma: Math.round(sigma * 1000) / 1000,
    sigmaRaw: Math.round(sigmaRaw * 1000) / 1000,
    dailyRegen: R,
    burnRate: Math.round(B * 1000) / 1000,
    status: getEconomyStatus(sigma),
    activeNodes,
    totalActiveMP
  }
}
