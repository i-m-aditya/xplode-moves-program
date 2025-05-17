use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::{commit_accounts, commit_and_undelegate_accounts};

declare_id!("7oEVduKtpfgYQYPWCdZoCYYwPp41Qeh2DJd3qZ7mWZaB");

pub const GAME_PDA_SEED: &[u8] = b"game-pda";

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Coordinates {
    pub x: u8,
    pub y: u8,
}

#[ephemeral]
#[program]
pub mod xplode_moves {
    use super::*;

    pub fn initialize_game(
        ctx: Context<InitializeGame>,
        game_id: String,
        grid_size: u8,
        bomb_positions: Vec<Coordinates>,
    ) -> Result<()> {
        // Validate grid size
        require!(grid_size <= 8, GameError::InvalidGridSize);

        let game_moves = &mut ctx.accounts.game_moves;
        game_moves.game_id = game_id.clone();
        game_moves.grid_size = grid_size;
        game_moves.bomb_positions = bomb_positions;
        game_moves.moves = Vec::new();

        msg!("Game initialized with ID: {}", game_id);
        Ok(())
    }

    pub fn record_move(
        ctx: Context<RecordMove>,
        player_name: String,
        cell: Coordinates,
    ) -> Result<()> {
        let game_moves = &mut ctx.accounts.game_moves;

        // Basic validation
        require!(
            cell.x < game_moves.grid_size && cell.y < game_moves.grid_size,
            GameError::InvalidCell
        );

        if game_moves.moves.len() == 45 {
            game_moves.moves[44] = Move {
                player_name: player_name.clone(),
                cell: cell.clone(),
                timestamp: Clock::get()?.unix_timestamp,
            };
        } else {
            // Add move to the list
            game_moves.moves.push(Move {
                player_name: player_name.clone(),
                cell: cell.clone(),
                timestamp: Clock::get()?.unix_timestamp,
            });
        }

        msg!(
            "Move:{}-{} recorded for player: {}",
            cell.x,
            cell.y,
            player_name
        );
        Ok(())
    }

    /// Delegate the game PDA to the ephemeral rollup
    pub fn delegate_game(ctx: Context<DelegateGame>, game_id: String) -> Result<()> {
        let pda_seeds: &[&[u8]] = &[GAME_PDA_SEED, game_id.as_bytes()];
        ctx.accounts.delegate_pda(
            &ctx.accounts.game_server,
            pda_seeds,
            DelegateConfig {
                commit_frequency_ms: 500, // 500ms commit interval
                validator: None,          // Use default validator
            },
        )?;
        msg!("Game {} delegated to ephemeral rollup", game_id);
        Ok(())
    }

    /// Manual commit the game state to base layer
    pub fn commit_game(ctx: Context<CommitGame>) -> Result<()> {
        commit_accounts(
            &ctx.accounts.game_server,
            vec![&ctx.accounts.game_moves.to_account_info()],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;
        msg!(
            "Game {} state committed to base layer",
            ctx.accounts.game_moves.game_id
        );
        Ok(())
    }

    /// Commit and undelegate the game from ephemeral rollup
    pub fn commit_and_undelegate_game(ctx: Context<CommitGame>) -> Result<()> {
        commit_and_undelegate_accounts(
            &ctx.accounts.game_server,
            vec![&ctx.accounts.game_moves.to_account_info()],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;
        msg!(
            "Game {} committed and undelegated from ephemeral rollup",
            ctx.accounts.game_moves.game_id
        );
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(game_id: String)]
pub struct InitializeGame<'info> {
    #[account(
        init_if_needed,
        payer = game_server,
        space = 8 + 32 + 1 + 4 + (8 * 2) + 4 + (50 * (32 + 2 + 8)), // 8 bomb positions
        seeds = [GAME_PDA_SEED, game_id.as_bytes()],
        bump
    )]
    pub game_moves: Account<'info, GameMoves>,
    #[account(mut)]
    pub game_server: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordMove<'info> {
    #[account(
        mut,
        seeds = [GAME_PDA_SEED, game_moves.game_id.as_bytes()],
        bump
    )]
    pub game_moves: Account<'info, GameMoves>,
    #[account(mut)]
    pub game_server: Signer<'info>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateGame<'info> {
    #[account(mut)]
    pub game_server: Signer<'info>,
    /// CHECK The pda to delegate
    #[account(mut, del)]
    pub pda: AccountInfo<'info>,
}

#[commit]
#[derive(Accounts)]
pub struct CommitGame<'info> {
    #[account(mut)]
    pub game_server: Signer<'info>,
    #[account(mut, seeds = [GAME_PDA_SEED, game_moves.game_id.as_bytes()], bump)]
    pub game_moves: Account<'info, GameMoves>,
}

#[account]
pub struct GameMoves {
    pub game_id: String,
    pub grid_size: u8,
    pub bomb_positions: Vec<Coordinates>,
    pub moves: Vec<Move>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Move {
    pub player_name: String,
    pub cell: Coordinates,
    pub timestamp: i64,
}

#[error_code]
pub enum GameError {
    #[msg("Invalid cell coordinates")]
    InvalidCell,
    #[msg("Invalid grid size - must be <= 5")]
    InvalidGridSize,
}
