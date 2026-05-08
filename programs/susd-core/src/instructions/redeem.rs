use anchor_lang::prelude::*;
use anchor_spl::token::{Token, Burn};
use crate::state::VaultConfig;
use crate::error::ErrorCode;
use crate::RedemptionEvent;

#[derive(Accounts)]
pub struct Redeem<'info> {
    #[account(
        mut,
        seeds = [b"vault_config"],
        bump = vault_config.bump,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    /// CHECK: PDA that holds SOL
    #[account(
        mut,
        seeds = [b"vault_escrow"],
        bump,
    )]
    pub vault_escrow: SystemAccount<'info>,

    #[account(
        mut,
        constraint = susd_mint.key() == vault_config.susd_mint,
    )]
    pub susd_mint: Account<'info, anchor_spl::token::Mint>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        associated_token::mint = susd_mint,
        associated_token::authority = user,
    )]
    pub user_susd_ata: Account<'info, anchor_spl::token::TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Redeem>, susd_amount: u64) -> Result<()> {
    require!(ctx.accounts.vault_config.sol_price_usd > 0, ErrorCode::OracleNotSet);
    require!(susd_amount > 0, ErrorCode::ZeroAmount);

    let susd_supply = ctx.accounts.susd_mint.supply;

    let redeemable_ratio: u8 = if ctx.accounts.vault_config.total_equity_usd >= susd_supply {
        100
    } else {
        let ratio = (ctx.accounts.vault_config.total_equity_usd as u128)
            .checked_mul(100)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(susd_supply as u128)
            .ok_or(ErrorCode::MathOverflow)? as u8;
        ratio.min(100)
    };

    require!(redeemable_ratio > 0, ErrorCode::ProtocolUnderwater);

    let effective_susd = if redeemable_ratio == 100 {
        susd_amount
    } else {
        (susd_amount as u128)
            .checked_mul(redeemable_ratio as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(100)
            .ok_or(ErrorCode::MathOverflow)? as u64
    };

    let sol_lamports = (effective_susd as u128)
        .checked_mul(100_000_000_000)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(ctx.accounts.vault_config.sol_price_usd as u128)
        .ok_or(ErrorCode::MathOverflow)? as u64;

    let vault_sol = ctx.accounts.vault_escrow.lamports();
    let min_buffer = (susd_supply as u128)
        .checked_mul(ctx.accounts.vault_config.liquidity_buffer_bps as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10000)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_mul(100_000_000_000)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(ctx.accounts.vault_config.sol_price_usd as u128)
        .ok_or(ErrorCode::MathOverflow)? as u64;

    require!(
        vault_sol.checked_sub(sol_lamports).ok_or(ErrorCode::MathOverflow)? >= min_buffer,
        ErrorCode::InsufficientLiquidity
    );

    require!(
        vault_sol >= sol_lamports,
        ErrorCode::InsufficientLiquidity
    );

    anchor_spl::token::burn(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Burn {
                mint: ctx.accounts.susd_mint.to_account_info(),
                from: ctx.accounts.user_susd_ata.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        effective_susd,
    )?;

    **ctx.accounts.vault_escrow.to_account_info().try_borrow_mut_lamports()? -= sol_lamports;
    **ctx.accounts.user.to_account_info().try_borrow_mut_lamports()? += sol_lamports;

    emit!(RedemptionEvent {
        user: ctx.accounts.user.key(),
        susd_requested: susd_amount,
        susd_burned: effective_susd,
        sol_returned: sol_lamports,
        redeemable_ratio,
    });

    Ok(())
}
