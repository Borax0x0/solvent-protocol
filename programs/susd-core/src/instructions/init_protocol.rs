use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token};
use crate::state::{VaultConfig, StakingState};
use crate::error::ErrorCode;

#[derive(Accounts)]
pub struct InitProtocol<'info> {
    #[account(
        init,
        payer = admin,
        space = VaultConfig::LEN,
        seeds = [b"vault_config"],
        bump,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    #[account(
        init,
        payer = admin,
        space = StakingState::LEN,
        seeds = [b"staking_state"],
        bump,
    )]
    pub staking_state: Account<'info, StakingState>,

    #[account(
        init,
        payer = admin,
        mint::decimals = 6,
        mint::authority = vault_config,
        seeds = [b"susd_mint"],
        bump,
    )]
    pub susd_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = admin,
        mint::decimals = 6,
        mint::authority = staking_state,
        seeds = [b"ssusd_mint"],
        bump,
    )]
    pub ssusd_mint: Account<'info, Mint>,

    /// CHECK: PDA that holds SOL
    #[account(
        seeds = [b"vault_escrow"],
        bump,
    )]
    pub vault_escrow: SystemAccount<'info>,

    #[account(mut)]
    pub admin: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<InitProtocol>, liquidity_buffer_bps: u16) -> Result<()> {
    require!(liquidity_buffer_bps <= 10000, ErrorCode::InvalidBufferBps);

    ctx.accounts.vault_config.admin_pubkey = ctx.accounts.admin.key();
    ctx.accounts.vault_config.susd_mint = ctx.accounts.susd_mint.key();
    ctx.accounts.vault_config.ssusd_mint = ctx.accounts.ssusd_mint.key();
    ctx.accounts.vault_config.liquidity_buffer_bps = liquidity_buffer_bps;
    ctx.accounts.vault_config.total_equity_usd = 0;
    ctx.accounts.vault_config.is_frozen = false;
    ctx.accounts.vault_config.sol_price_usd = 0;
    ctx.accounts.vault_config.bump = ctx.bumps.vault_config;

    ctx.accounts.staking_state.ssusd_exchange_rate = 1_000_000_000_000;
    ctx.accounts.staking_state.total_staked_susd = 0;
    ctx.accounts.staking_state.last_yield_timestamp = Clock::get()?.unix_timestamp;
    ctx.accounts.staking_state.bump = ctx.bumps.staking_state;

    Ok(())
}
