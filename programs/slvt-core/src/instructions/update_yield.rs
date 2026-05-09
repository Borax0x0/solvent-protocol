use anchor_lang::prelude::*;
use crate::state::{StakingState, VaultConfig, YieldReceipt};
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(new_exchange_rate: u128, jito_yield_usd: u64, drift_funding_usd: u64, receipt_index: u32)]
pub struct UpdateYield<'info> {
    #[account(
        mut,
        seeds = [b"staking_state"],
        bump = staking_state.bump,
        constraint = admin.key() == vault_config.admin_pubkey @ ErrorCode::Unauthorized,
    )]
    pub staking_state: Account<'info, StakingState>,

    #[account(
        seeds = [b"vault_config"],
        bump = vault_config.bump,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    #[account(
        init,
        payer = admin,
        space = YieldReceipt::LEN,
        seeds = [b"yield_receipt", receipt_index.to_le_bytes().as_ref()],
        bump,
    )]
    pub yield_receipt: Account<'info, YieldReceipt>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<UpdateYield>,
    new_exchange_rate: u128,
    jito_yield_usd: u64,
    drift_funding_usd: u64,
    receipt_index: u32,
) -> Result<()> {
    require!(
        new_exchange_rate >= ctx.accounts.staking_state.sslvt_exchange_rate,
        ErrorCode::RateCannotDecrease
    );

    let old_exchange_rate = ctx.accounts.staking_state.sslvt_exchange_rate;

    ctx.accounts.staking_state.sslvt_exchange_rate = new_exchange_rate;
    ctx.accounts.staking_state.last_yield_timestamp = Clock::get()?.unix_timestamp;

    ctx.accounts.yield_receipt.timestamp = Clock::get()?.unix_timestamp;
    ctx.accounts.yield_receipt.jito_yield_usd = jito_yield_usd;
    ctx.accounts.yield_receipt.drift_funding_usd = drift_funding_usd;
    ctx.accounts.yield_receipt.total_yield_usd = jito_yield_usd
        .checked_add(drift_funding_usd)
        .ok_or(ErrorCode::MathOverflow)?;
    ctx.accounts.yield_receipt.old_exchange_rate = old_exchange_rate;
    ctx.accounts.yield_receipt.new_exchange_rate = new_exchange_rate;
    ctx.accounts.yield_receipt.receipt_index = receipt_index;
    ctx.accounts.yield_receipt.bump = ctx.bumps.yield_receipt;

    Ok(())
}
