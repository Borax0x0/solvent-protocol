# Solvent Protocol — Hackathon Submissions

## Core Project Description (for all tracks)

**Solvent Protocol — Delta-neutral stablecoin on Solana with proportional redemptions**

Stablecoin holders shouldn't lose everything when a protocol depegs. Ethena's USDe and similar delta-neutral stablecoins use a hard freeze mechanism: if solvency drops below 100%, all redemptions halt. This creates bank-run dynamics — the first to redeem wins, everyone else is locked out. Solvent Protocol replaces this binary model with proportional redemptions: if the protocol is 90% solvent, you redeem 90% of your position. No cliff, no freeze, no bank run.

Users deposit SOL and receive SLVT, a $1-pegged stablecoin. The deposited SOL is split into two yield strategies by the Keeper Engine: JitoSOL staking (~7% APY) and a Drift SOL-PERP short position (hedging SOL price exposure + earning funding payments). The yield accrues to sSLVT, a staking token with an appreciating exchange rate. Every yield update is recorded on-chain as a YieldReceipt PDA with a Jito vs Drift breakdown — fully auditable, no trust required.

**Why Solana**: Delta-neutral strategies require fast, cheap rebalancing. Solana's 400ms block times and sub-cent fees make the Keeper Engine viable. On Ethereum, a single rebalance costs $5-20 in gas. On Solana, it costs $0.001.

**Technical highlights**: Proportional redemption math on-chain (no hard freeze), YieldReceipt audit trail (on-chain PDAs, not off-chain reporting), sSLVT with real mint/burn and appreciating exchange rate (not Token-2022 cosmetic interest), Keeper Engine with mock-first architecture for resilient devnet testing, 19/19 LiteSVM tests covering all edge cases including 50% and 90% solvency scenarios.

---

## Track: 100xDevs ($10K USDC pool)

**Angle**: Builder-first, practical engineering. Emphasize technical execution and completeness.

### Submission Copy

**Solvent Protocol — A delta-neutral stablecoin that doesn't freeze when things get rough**

Most delta-neutral stablecoins have a fatal flaw: when solvency drops below 100%, redemptions freeze entirely. The first users out win; everyone else is trapped. Solvent Protocol fixes this with proportional redemptions — 90% solvent means you redeem 90%, always. No bank-run cliff.

We built the full stack in 5 weeks: 10-instruction Anchor program with 19 LiteSVM tests, a Keeper Engine orchestrating Jito staking + Drift perps, and a premium frontend with wallet integration. Everything is live on devnet and end-to-end tested.

This is builder-first infrastructure. The Keeper Engine uses mock-first architecture — MOCK_DRIFT and MOCK_JITO aren't hacks, they're legitimate fallback modes that let the protocol run end-to-end even when devnet infrastructure is unreliable. The proportional redemption logic handles 0%, 50%, 90%, and 100% solvency with explicit on-chain error codes. YieldReceipts are on-chain PDAs, not off-chain promises.

**What works right now**: Deposit SOL → get SLVT. Stake SLVT → get sSLVT with appreciating exchange rate. Redeem SLVT → get SOL back proportionally. Keeper Engine updates equity and yield on devnet. All 19 tests pass in 141ms.

---

## Track: Tether ($10K USDT pool)

**Angle**: Stablecoin innovation. Position SLVT as a next-generation stablecoin design that fixes Ethena's redemption cliff.

### Submission Copy

**Solvent Protocol — A stablecoin that handles solvency stress without freezing**

Tether proved that transparent reserves build trust. Ethena proved that delta-neutral backing can generate yield. But Ethena's USDe has a critical flaw: when the protocol is undercollateralized, redemptions freeze entirely. 100% or nothing. This creates the exact bank-run dynamic that stablecoins are supposed to prevent.

Solvent Protocol introduces proportional redemptions: if the protocol is 90% solvent, you redeem 90% of your position. If it's 50% solvent, you redeem 50%. The math runs on-chain with explicit error codes for zero-solvency scenarios. There's no governance vote to freeze, no admin key that locks — the protocol always lets users exit at the fair proportional rate.

The yield comes from JitoSOL staking (~7% APY) and Drift SOL-PERP shorts (funding payments + price hedge). Every yield update is recorded as an on-chain YieldReceipt PDA with a Jito vs Drift breakdown — a verifiable audit trail, not an off-chain report. Users stake SLVT into sSLVT, which has a real appreciating exchange rate via mint/burn (not Token-2022's cosmetic interest-bearing extension).

This is what the next generation of stablecoins looks like: always redeemable, always auditable, delta-neutral yield without the freeze risk.

---

## Track: Main Colosseum (Grand Champion + Accelerator)

**Angle**: Product + business potential. Show this is a real protocol, not just a hackathon project.

### Submission Copy

**Solvent Protocol — The stablecoin that never locks you out**

Stablecoins should be stable — even under stress. But when Ethena's USDe faced solvency concerns, users couldn't redeem at all. The protocol's 100%-or-nothing freeze mechanism created the bank run it was designed to prevent. Solvent Protocol replaces binary freezes with proportional redemptions: 90% solvent = redeem 90%. Always fair, always accessible.

We've built the complete protocol: Anchor program with 10 instructions and 19 tests, Keeper Engine managing JitoSOL + Drift perp positions, premium frontend with Phantom wallet integration, all live on devnet. The architecture is production-viable — the Keeper Engine uses mock-first fallback modes for resilience, YieldReceipts provide on-chain audit trails, and sSLVT uses real mint/burn economics.

Next: mainnet deployment with real JitoSOL staking and Drift SOL-PERP shorts. The addressable market is the $200B+ stablecoin market looking for yield-bearing, always-redeemable alternatives to USDT/USDC.

---

## Demo Video Scripts

### Pitch Video (2:30) — The Why

**0:00-0:15** — "When Ethena's USDe depegged, users couldn't redeem at all. The protocol froze — 100% or nothing. That's a bank run, not a stablecoin."

**0:15-0:35** — "Solvent Protocol introduces proportional redemptions. 90% solvent? You redeem 90%. 50%? You get 50%. Always fair, never locked out. This is how stablecoins should handle stress."

**0:35-1:00** — "Here's how it works: you deposit SOL, get SLVT — a dollar-pegged token. The Keeper Engine deploys your SOL into JitoSOL staking for 7% APY and a Drift SOL-PERP short to hedge price risk. Delta-neutral, yield-generating. Stake SLVT into sSLVT and watch the exchange rate appreciate."

**1:00-1:30** — "Every yield update is an on-chain YieldReceipt — a PDA with the Jito yield, Drift funding, and old/new exchange rate. Not an off-chain report. Not a promise. Verifiable on Solana Explorer."

**1:30-2:00** — "We built the full stack in 5 weeks as a solo builder. 10-instruction Anchor program, 19 tests covering edge cases from 0% to 100% solvency, Keeper Engine running on devnet, premium frontend with wallet integration. Everything ships."

**2:00-2:30** — "The stablecoin market is $200B+. Users deserve a stablecoin that doesn't freeze under stress. Solvent Protocol is that stablecoin. Try it on devnet, star the repo, follow us."

### Technical Demo Video (2:30) — The How

**0:00-0:15** — "Let me show you Solvent Protocol end-to-end, live on devnet."

**0:15-0:45** — [Open frontend, connect Phantom wallet] "Connect wallet, deposit 0.05 SOL. The program mints SLVT at the oracle rate — you can see the transaction on Solana Explorer." [Show Explorer tx]

**0:45-1:15** — "Now stake SLVT into sSLVT. The exchange rate starts at 1:1 and appreciates as yield accrues." [Click stake, show tx] "The Audit page shows every YieldReceipt — here's the Jito yield component, the Drift funding component, and the resulting exchange rate update."

**1:15-1:45** — "Let's test the key differentiator: proportional redemptions." [Show test output or CLI] "At 90% solvency, a user redeeming 100 SLVT gets 90 SLVT worth of SOL. At 50%, they get 50%. At 0%, the transaction fails with ProtocolUnderwater. No freeze, no cliff — fair proportional math on-chain."

**1:45-2:15** — "Under the hood: the Keeper Engine runs a cron loop — equity updates every 60 seconds, yield updates every 5 minutes. It rebalances between JitoSOL and Drift at 50/50, with health checks for the perp position. Mock modes let it run end-to-end even when devnet infrastructure is flaky."

**2:15-2:30** — "19 tests, all passing. Full E2E on devnet. Code at github.com/Borax0x0/solvent-protocol. Try it yourself."

---

## Submission Checklist

- [ ] GitHub repo public: https://github.com/Borax0x0/solvent-protocol
- [ ] Live frontend on Vercel (user deploying manually)
- [ ] Program deployed on devnet: `5rzosayUo9e8CmXit4ydqu8uk3tCGFFqUdhHCASFe5ho`
- [ ] Pitch video recorded and uploaded (YouTube unlisted)
- [ ] Technical demo video recorded and uploaded (YouTube unlisted)
- [ ] Twitter/X account created for project
- [ ] Colosseum portal submission completed
- [ ] Superteam Earn submission completed (for 100xDevs track)
- [ ] Tether track submission completed (if on Superteam Earn)
