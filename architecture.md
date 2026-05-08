# SUSD Protocol: Architecture Specification (v4)

## Changelog from v3

| Change | Why |
|---|---|
| **Proportional redemptions** | Novel mechanism — no competitor has it. Users redeem a % of their SUSD proportional to protocol solvency, instead of hard freeze. |
| **YieldReceipt PDA** | On-chain audit trail for every yield update. Logs JitoSOL %, Drift funding %, and total yield. Trust narrative. |
| **Auto-unfreeze in update_equity** | v3 spec said auto-unfreeze but implementation only froze on zero equity. Now explicit in spec. |
| **Drift build, Jupiter narrative** | Build with Drift SDK (proven, documented). Pitch Jupiter Perps as production venue. |
| **Token2022 interest-bearing: REJECTED** | Researched and rejected — interest is cosmetic/virtual, raw on-chain balance doesn't change. Fatal for a stablecoin where peg trust matters. sSUSD with real token minting is the right model. |

---

## 1. Monorepo Structure

```
susd-protocol/
├── architecture.md           # This file
├── implementation-plan.md    # Build tracking & task breakdown
├── programs/susd-core/       # Single Anchor program (Vault + Staking)
├── keeper-engine/            # Node.js TypeScript daemon (Jito + Drift)
└── web-interface/            # Next.js consumer dashboard
```

## 2. The Anchor Program (`susd-core`)

### Account Structures

**VaultConfig** (PDA, single instance):
- `admin_pubkey: Pubkey` — set once at init, rotatable via `set_admin`
- `susd_mint: Pubkey` — the $1 stablecoin mint
- `ssusd_mint: Pubkey` — the yield-bearing mint
- `liquidity_buffer_bps: u16` — 1500 = 15% of SUSD supply must remain as SOL in vault
- `total_equity_usd: u64` — pushed by keeper (JitoSOL + Drift PnL + vault SOL, in USD cents)
- `is_frozen: bool` — emergency freeze on all operations
- `sol_price_usd: u64` — last known oracle price (USD cents), updated by keeper
- `bump: u8`

**StakingState** (PDA, single instance):
- `ssusd_exchange_rate: u128` — starts at 1_000_000_000_000 (1.0 with 12 decimals precision)
- `total_staked_susd: u64` — total SUSD locked in staking vault
- `last_yield_timestamp: i64` — last time yield was accrued
- `bump: u8`

**YieldReceipt** (PDA, append-only log, one per yield update):
- `timestamp: i64` — when this yield was recorded
- `jito_yield_usd: u64` — JitoSOL staking yield portion (USD cents)
- `drift_funding_usd: u64` — Drift SOL-PERP funding portion (USD cents)
- `total_yield_usd: u64` — sum of above (USD cents)
- `old_exchange_rate: u128` — exchange rate before this update
- `new_exchange_rate: u128` — exchange rate after this update
- `receipt_index: u32` — sequential index (0, 1, 2, ...)
- `bump: u8`

### Instructions (11 total)

**`init_protocol`**
- Signer: admin (becomes stored admin_pubkey)
- Creates VaultConfig PDA, StakingState PDA
- Creates SUSD mint (authority = VaultConfig PDA)
- Creates sSUSD mint (authority = StakingState PDA)
- NOT `init_if_needed` — explicit `init` with admin signer constraint

**`deposit`**
- Signer: user
- CPIs: `system_instruction::transfer` (SOL from user to vault PDA), `token::mint_to` (SUSD to user ATA)
- Math: `susd_mint_amount = sol_lamports × oracle_price_cents / 100_000_000_000`
- Creates user SUSD ATA via `associated_token::create_idempotent`

**`redeem`** (MODIFIED — proportional redemptions)
- Signer: user
- CPIs: `token::burn` (SUSD from user ATA, VaultConfig PDA as mint authority), `system_instruction::transfer` (SOL from vault PDA to user)
- Math: `sol_returned = effective_susd_burned × 100_000_000_000 / oracle_price_cents`
- **Proportional logic:**
  - If `total_equity_usd >= SUSD_supply`: user can redeem 100% of requested amount (fully solvent)
  - If `total_equity_usd < SUSD_supply`: `redeemable_ratio = total_equity_usd × 100 / SUSD_supply` (in whole percent, 0–100)
  - `max_redeemable = user_susd_amount × redeemable_ratio / 100`
  - User burns `max_redeemable` SUSD and gets SOL for that amount
  - Remaining SUSD stays in user's wallet (they keep the claim)
- Liquidity check still applies on top: vault SOL must remain above buffer after withdrawal
- Return specific error codes:
  - `InsufficientLiquidity` → UI: "Liquidity buffer low, retry in ~60s"
  - If `redeemable_ratio == 0` → UI: "Protocol temporarily insolvent, no redemptions possible"
  - If `redeemable_ratio < 100` → UI: "Protocol {ratio}% solvent. You can redeem {max_redeemable} of {requested} SUSD."

**`admin_withdraw`**
- Signer: must match stored `admin_pubkey`
- CPIs: `system_instruction::transfer` (SOL from vault PDA to admin)
- Cap: `max_withdraw = vault_sol_lamports - (SUSD_supply × liquidity_buffer_bps / oracle_price_cents / 10000)`
- If `max_withdraw <= 0`, instruction fails with `BufferExceeded`

**`admin_deposit`**
- Signer: must match stored `admin_pubkey`
- CPIs: `system_instruction::transfer` (SOL from admin to vault PDA)
- No cap on deposits — bot is returning yield + principal

**`update_equity`** (MODIFIED — proper auto-unfreeze)
- Signer: must match stored `admin_pubkey`
- Updates `total_equity_usd` and `sol_price_usd` on VaultConfig
- If `total_equity_usd < SUSD_supply`: sets `is_frozen = true`
- If `total_equity_usd >= SUSD_supply` and `is_frozen == true`: sets `is_frozen = false` (auto-unfreeze)
- Note: `is_frozen` still blocks new deposits/stakes as a safety measure, but `redeem` uses proportional logic independently

**`stake`**
- Signer: user
- CPIs: `token::transfer` (SUSD from user ATA to staking PDA's ATA), `token::mint_to` (sSUSD to user ATA)
- Math: `ssusd_minted = susd_amount × 1e12 / ssusd_exchange_rate`
- Creates user sSUSD ATA via `associated_token::create_idempotent`
- Increments `total_staked_susd`

**`unstake`**
- Signer: user
- CPIs: `token::burn` (sSUSD from user ATA), `token::transfer` (SUSD from staking PDA's ATA to user ATA)
- Math: `susd_returned = ssusd_burned × ssusd_exchange_rate / 1e12`
- Decrements `total_staked_susd`

**`update_yield`** (MODIFIED — creates YieldReceipt)
- Signer: must match stored `admin_pubkey`
- Receives: `new_exchange_rate: u128`, `jito_yield_usd: u64`, `drift_funding_usd: u64`
- Validates: new rate >= old rate (rate can never decrease)
- Updates `ssusd_exchange_rate` and `last_yield_timestamp` on StakingState
- Creates new YieldReceipt PDA with full breakdown of yield sources
- YieldReceipt seeds: `["yield_receipt", receipt_index.to_le_bytes()]`

**`set_admin`**
- Signer: current `admin_pubkey`
- Updates `admin_pubkey` to new value
- Enables key rotation without redeploying

### PDA Seeds

| Account | Seeds |
|---|---|
| VaultConfig | `["vault_config"]` |
| StakingState | `["staking_state"]` |
| Vault SOL Escrow | `["vault_escrow"]` |
| Staking SUSD ATA | `["staking_vault"]` |
| YieldReceipt | `["yield_receipt", receipt_index.to_le_bytes()]` |

### CPI Authority Mapping

| Instruction | CPI | Authority |
|---|---|---|
| `deposit` | `mint_to` (SUSD) | VaultConfig PDA |
| `redeem` | `burn` (SUSD) | VaultConfig PDA |
| `stake` | `transfer` (SUSD) | User (signer) |
| `stake` | `mint_to` (sSUSD) | StakingState PDA |
| `unstake` | `burn` (sSUSD) | StakingState PDA |
| `unstake` | `transfer` (SUSD) | StakingState PDA (signs for its own ATA) |

### Critical Design Note: Staking SUSD Custody

The staking PDA needs an ATA that holds SUSD. The `StakingState` PDA owns this ATA. On `stake`, user transfers SUSD into it. On `unstake`, the PDA signs the `transfer` CPI to send SUSD back. PDAs can sign for ATAs at their own address.

### Critical Design Note: Proportional Redemptions

Traditional stablecoins use binary solvency: either you can redeem 100% or you can't redeem at all. This creates a cliff — the moment equity drops below supply, all redemptions halt and panic ensues.

Proportional redemptions smooth this cliff:
- At 90% solvency, users can redeem 90% of their SUSD
- At 50% solvency, users can redeem 50%
- Users always keep unredeemed SUSD as a claim on future recovery
- No bank-run dynamics: there's no advantage to being first

This is the key differentiator from Ethena, Reflect, and every other delta-neutral stablecoin.

### Critical Design Note: YieldReceipt Audit Trail

Every yield update writes a permanent on-chain receipt showing where the yield came from. This allows:
- Anyone to verify the yield chain (JitoSOL staking vs Drift funding)
- Auditors to reconstruct the exchange rate history
- Frontend to display yield breakdown charts
- No trust required — the data is on-chain

The `receipt_index` increments sequentially. The StakingState doesn't store the current index — the keeper tracks it off-chain and passes it as an instruction argument.

## 3. Protocol Mathematics

### SUSD (The Base Peg)
```
Minting:    SUSD_minted = SOL_deposited_lamports × oracle_price_cents / 100_000_000_000
            (oracle_price_cents = SOL price in USD × 100, e.g., 15000 for $150)

Redemption: SOL_returned_lamports = SUSD_burned × 100_000_000_000 / oracle_price_cents
```

SUSD is always exactly $1.00. No exchange rate on SUSD itself.

### sSUSD (The Yield Bearer)
```
Exchange rate: 128-bit fixed point, 12 decimal precision
               Starts at 1_000_000_000_000 (= 1.0)

Staking:    sSUSD_minted = SUSD_locked × 1e12 / current_exchange_rate

Unstaking:  SUSD_returned = sSUSD_burned × current_exchange_rate / 1e12

Yield accrual (off-chain):
  total_yield_earned_usd = (jito_staking_yield + drift_funding_pnl)
  new_rate = old_rate × (total_staked_susd + yield_earned) / total_staked_susd
```

### Proportional Redemption Math
```
If total_equity_usd >= SUSD_supply:
  redeemable_ratio = 100  (fully solvent, full redemption)

If total_equity_usd < SUSD_supply:
  redeemable_ratio = (total_equity_usd × 100) / SUSD_supply  (whole percent, 0–100)

max_redeemable = user_requested_susd × redeemable_ratio / 100

SOL_returned = max_redeemable × 100_000_000_000 / oracle_price_cents
SUSD_burned  = max_redeemable
SUSD_retained = user_requested_susd - max_redeemable
```

### Safety Constraints
```
Liquidity Buffer:
  min_vault_sol = SUSD_supply × buffer_bps / 10000 / oracle_price
  max_admin_withdraw = vault_sol - min_vault_sol

Solvency (proportional):
  redeemable_ratio = min(100, total_equity_usd × 100 / SUSD_supply)
  If redeemable_ratio == 0 → ProtocolUnderwater error

sSUSD Rate:
  new_rate MUST be >= old_rate  // rate can never decrease
  // If yield is negative (funding rates flip), rate stays flat, not negative
  // Floor yield = Jito staking ~7%

Freeze Logic:
  is_frozen = true  when total_equity_usd < SUSD_supply
  is_frozen = false when total_equity_usd >= SUSD_supply (auto-unfreeze)
  Note: redeem uses proportional logic independently of is_frozen flag
```

## 4. Keeper Engine (TypeScript Daemon)

### Architecture
```
keeper-engine/
├── src/
│   ├── index.ts              # Entry point, starts cron jobs
│   ├── config.ts             # Loads .env (admin keypair, RPC endpoint)
│   ├── drift-client.ts       # Drift SDK wrapper (deposit, short, health check)
│   ├── jito-client.ts        # JitoSOL staking wrapper
│   ├── vault-interactions.ts # Sends txs to Anchor program (update_equity, update_yield, admin_deposit, admin_withdraw)
│   ├── equity-calculator.ts  # Computes total_equity from JitoSOL + Drift PnL + vault SOL
│   ├── yield-calculator.ts   # Computes new sSUSD exchange rate + yield breakdown
│   └── rebalancer.ts         # Decides when to add/remove collateral, replenish buffer
├── package.json
├── tsconfig.json
└── .env                      # ADMIN_KEYPAIR, RPC_ENDPOINT, DRIFT_ENV
```

### Rebalancing Logic
```
Every 1 minute:
  1. Query vault SOL balance
  2. Query JitoSOL balance + value
  3. Query Drift position PnL + health factor
  4. Calculate total_equity_usd
  5. Send update_equity tx to Anchor program

Every 5 minutes:
  1. Calculate yield since last accrual
  2. Break down: jito_yield_usd vs drift_funding_usd
  3. Calculate new sSUSD exchange rate
  4. Track receipt_index off-chain (increment from last known)
  5. Send update_yield tx to Anchor program (with yield breakdown + receipt_index)

Every 5 minutes (health check):
  If Drift health_factor < 2.0:
    → admin_deposit from reserves into Drift margin
  If Drift health_factor > 5.0:
    → withdraw excess margin from Drift
    → admin_deposit back into vault

Buffer replenishment (on every equity update):
  If vault_sol < 15% buffer:
    → unwind portion of Drift position
    → admin_deposit SOL into vault
    → log "BUFFER REPLENISH: withdrew X SOL from Drift"

Funding rate negative for >48h:
  → Log warning, do NOT decrease sSUSD rate
  → Rate stays flat (yield floor = Jito staking ~7%)
```

### Drift Integration Notes
- **Build with Drift SDK** — proven, documented, TypeScript-native
- **Pitch Jupiter Perps** as production venue in demo/deck ("Drift for devnet, Jupiter for mainnet")
- Account creation is a separate transaction (Drift UserAccount)
- Deposit collateral and open position are separate transactions
- Market indices must be hardcoded (SOL-PERP market index from Drift config)
- Use devnet for testing, configurable RPC endpoint

### Pyth Oracle Integration
- Use `@pythnetwork/pyth-solana-receiver` on devnet
- Free, no API key needed
- Keeper reads Pyth price off-chain via Hermes endpoint
- Pushes price to Anchor program via `update_equity`
- Do NOT hardcode SOL price

## 5. Web Interface (Next.js Dashboard)

### Components
1. **Deposit Card** — SOL input → SUSD output (live Pyth price), "Deposit" button, Phantom wallet connect
2. **Stake Card** — SUSD input → sSUSD output (current exchange rate), "Stake" button
3. **Redeem/Unstake** — Burn SUSD or sSUSD, get SOL/SUSD back
4. **Yield Analytics Panel** — Blended APY, Jito staking yield %, Drift funding rate %, sSUSD exchange rate
5. **Yield History** — Fetch YieldReceipts on-chain, display yield breakdown chart (Jito vs Drift over time)
6. **Protocol Health** — Total equity, SUSD supply, solvency %, liquidity buffer %, frozen status
7. **Redemption Status** — If solvency < 100%, show "You can redeem X% of your SUSD right now" with explanation

### Error Handling
- `ProtocolUnderwater` → "Protocol temporarily insolvent, no redemptions possible"
- `InsufficientLiquidity` → "Liquidity buffer low, retry in ~60s"
- `PartialRedemption` → "Protocol {ratio}% solvent. You can redeem {amount} of {requested} SUSD. Keep remaining SUSD as a recovery claim."
- Generic TX failure → "Transaction failed, please try again"

## 6. Build Timeline (18 days remaining, Apr 24 – May 11)

| Days | Phase | Deliverable |
|---|---|---|
| 1–3 | Anchor Program Fixes | Fix compile errors, add proportional redemptions, add YieldReceipt, fix auto-unfreeze |
| 4–5 | Anchor Tests | Unit tests with `bankrun` for all 11 instructions, edge cases for proportional math |
| 6–10 | Keeper Engine | Drift SDK, Jito SDK, cron jobs, rebalancer, yield breakdown tracking |
| 11–13 | Frontend | Dashboard, wallet connect, live data, yield history, redemption status |
| 14–16 | Integration | Devnet end-to-end flow (deposit → stake → yield → proportional redeem) |
| 17–18 | Submit | Colosseum submission, demo video, README |

## 7. Differentiation Summary

| Feature | Why It Wins | Competitors |
|---|---|---|
| **Proportional Redemptions** | No cliff, no bank-run dynamics. Users always get a fair %. Nobody does this. | Ethena: hard freeze. Reflect: hard freeze. Everyone: hard freeze. |
| **YieldReceipt Audit Trail** | On-chain yield breakdown per update. Fully auditable, zero trust required. | Ethena: off-chain. Nobody logs yield sources on-chain. |
| **sSUSD (not Token2022)** | Real token minting, real value. Token2022 interest-bearing is cosmetic — fatal for stablecoins. | N/A — this is the established model, but proven correct by research. |
| **Drift + Jupiter narrative** | Working devnet integration with Drift. Jupiter as production path shows vision. | Reflect uses Drift only. No Jupiter narrative. |
