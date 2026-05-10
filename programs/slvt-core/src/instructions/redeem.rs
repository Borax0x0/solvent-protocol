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
        constraint = slvt_mint.key() == vault_config.slvt_mint,
    )]
    pub slvt_mint: Account<'info, anchor_spl::token::Mint>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        associated_token::mint = slvt_mint,
        associated_token::authority = user,
    )]
    pub user_slvt_ata: Account<'info, anchor_spl::token::TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Redeem>, slvt_amount: u64) -> Result<()> {
    require!(ctx.accounts.vault_config.sol_price_usd > 0, ErrorCode::OracleNotSet);
    require!(slvt_amount > 0, ErrorCode::ZeroAmount);

    let slvt_supply = ctx.accounts.slvt_mint.supply;

    let slvt_supply_ui = (ctx.accounts.slvt_mint.supply as u128)
        .checked_div(1_000_000)
        .ok_or(ErrorCode::MathOverflow)?;

    let redeemable_ratio: u8 = if ctx.accounts.vault_config.total_equity_usd as u128 >= slvt_supply_ui {
        100
    } else {
        let ratio = (ctx.accounts.vault_config.total_equity_usd as u128)
            .checked_mul(100)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(slvt_supply_ui)
            .ok_or(ErrorCode::MathOverflow)? as u8;
        ratio.min(100)
    };

    require!(redeemable_ratio > 0, ErrorCode::ProtocolUnderwater);

    let effective_slvt = if redeemable_ratio == 100 {
        slvt_amount
    } else {
        (slvt_amount as u128)
            .checked_mul(redeemable_ratio as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(100)
            .ok_or(ErrorCode::MathOverflow)? as u64
    };

    let sol_lamports = (effective_slvt as u128)
        .checked_mul(100_000_000_000)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(ctx.accounts.vault_config.sol_price_usd as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(1_000_000)
        .ok_or(ErrorCode::MathOverflow)? as u64;

    let vault_sol = ctx.accounts.vault_escrow.lamports();
    let slvt_supply_ui = (ctx.accounts.slvt_mint.supply as u128)
        .checked_div(1_000_000)
        .ok_or(ErrorCode::MathOverflow)?;

    let min_buffer = slvt_supply_ui
        .checked_mul(ctx.accounts.vault_config.liquidity_buffer_bps as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10000)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_mul(100_000_000_000)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(ctx.accounts.vault_config.sol_price_usd as u128)
        .ok_or(ErrorCode::MathOverflow)? as u64;

    require!(
        vault_sol >= sol_lamports,
        ErrorCode::InsufficientLiquidity
    );

    require!(
        vault_sol - sol_lamports >= min_buffer,
        ErrorCode::InsufficientLiquidity
    );

    anchor_spl::token::burn(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Burn {
                mint: ctx.accounts.slvt_mint.to_account_info(),
                from: ctx.accounts.user_slvt_ata.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        effective_slvt,
    )?;

    let vault_escrow_bump = ctx.bumps.vault_escrow;
    anchor_lang::system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.key(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.vault_escrow.to_account_info(),
                to: ctx.accounts.user.to_account_info(),
            },
            &[&[b"vault_escrow", &[vault_escrow_bump]]],
        ),
        sol_lamports,
    )?;

    emit!(RedemptionEvent {
        user: ctx.accounts.user.key(),
        slvt_requested: slvt_amount,
        slvt_burned: effective_slvt,
        sol_returned: sol_lamports,
        redeemable_ratio,
    });

    Ok(())
}
