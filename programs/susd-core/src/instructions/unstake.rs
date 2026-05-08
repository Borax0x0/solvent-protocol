use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, Burn, Transfer};
use crate::state::{VaultConfig, StakingState};
use crate::error::ErrorCode;

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(
        seeds = [b"vault_config"],
        bump = vault_config.bump,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    #[account(
        mut,
        seeds = [b"staking_state"],
        bump = staking_state.bump,
    )]
    pub staking_state: Account<'info, StakingState>,

    #[account(
        mut,
        constraint = susd_mint.key() == vault_config.susd_mint @ ErrorCode::MintMismatch,
    )]
    pub susd_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = ssusd_mint.key() == vault_config.ssusd_mint @ ErrorCode::MintMismatch,
    )]
    pub ssusd_mint: Account<'info, Mint>,

    /// CHECK: PDA ATA that holds staked SUSD
    #[account(
        mut,
        associated_token::mint = susd_mint,
        associated_token::authority = staking_state,
    )]
    pub staking_susd_ata: Account<'info, anchor_spl::token::TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        associated_token::mint = susd_mint,
        associated_token::authority = user,
    )]
    pub user_susd_ata: Account<'info, anchor_spl::token::TokenAccount>,

    #[account(
        mut,
        associated_token::mint = ssusd_mint,
        associated_token::authority = user,
    )]
    pub user_ssusd_ata: Account<'info, anchor_spl::token::TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Unstake>, ssusd_amount: u64) -> Result<()> {
    require!(!ctx.accounts.vault_config.is_frozen, ErrorCode::ProtocolFrozen);
    require!(ssusd_amount > 0, ErrorCode::ZeroAmount);

    let susd_amount = (ssusd_amount as u128)
        .checked_mul(ctx.accounts.staking_state.ssusd_exchange_rate)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(1_000_000_000_000)
        .ok_or(ErrorCode::MathOverflow)? as u64;

    require!(
        ctx.accounts.staking_susd_ata.amount >= susd_amount,
        ErrorCode::InsufficientStakingLiquidity
    );

    anchor_spl::token::burn(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Burn {
                mint: ctx.accounts.ssusd_mint.to_account_info(),
                from: ctx.accounts.user_ssusd_ata.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        ssusd_amount,
    )?;

    let bump = ctx.accounts.staking_state.bump;
    anchor_spl::token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.staking_susd_ata.to_account_info(),
                to: ctx.accounts.user_susd_ata.to_account_info(),
                authority: ctx.accounts.staking_state.to_account_info(),
            },
            &[&[b"staking_state", &[bump]]],
        ),
        susd_amount,
    )?;

    ctx.accounts.staking_state.total_staked_susd = ctx
        .accounts
        .staking_state
        .total_staked_susd
        .checked_sub(susd_amount)
        .ok_or(ErrorCode::MathOverflow)?;

    Ok(())
}
