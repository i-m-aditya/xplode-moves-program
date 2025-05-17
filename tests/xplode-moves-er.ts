import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { XplodeMoves } from "../target/types/xplode_moves";
import { expect } from "chai";
import { Connection, Keypair } from "@solana/web3.js";
import { GetCommitmentSignature } from "@magicblock-labs/ephemeral-rollups-sdk";

// Helper function to sleep for a specified number of milliseconds
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper function to fetch game state
const getGameState = async (
  program: Program<XplodeMoves>,
  pda: anchor.web3.PublicKey,
  connection: anchor.web3.Connection
) => {
  try {
    const account = await program.account.gameMoves.fetch(pda, "processed");
    return {
      gameId: account.gameId,
      gridSize: account.gridSize,
      moves: account.moves,
      bombPositions: account.bombPositions,
    };
  } catch (e) {
    console.log("Error fetching game state:", e);
    return null;
  }
};

describe("xplode-moves-ephemeral", () => {
  // Configure the client to use devnet
  //   const provider = anchor.AnchorProvider.env();
  //   anchor.setProvider(provider);

  //   // Configure ER provider to also use devnet
  //   const providerEphemeralRollup = new anchor.AnchorProvider(
  //     new anchor.web3.Connection("https://devnet.magicblock.app/", {
  //       wsEndpoint: "wss://devnet.magicblock.app/",
  //       commitment: "confirmed",
  //       confirmTransactionInitialTimeout: 120000, // 2 minutes timeout
  //     }),
  //     anchor.Wallet.local()
  //   );
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // // Configure ER provider to also use devnet
  // const providerEphemeralRollup = new anchor.AnchorProvider(
  //   new anchor.web3.Connection("https://devnet.magicblock.app/", {
  //     wsEndpoint: "wss://devnet.magicblock.app/",
  //   }),
  //   anchor.Wallet.local()
  // );
  // const providerEphemeralRollup = new anchor.AnchorProvider(
  //   new anchor.web3.Connection(
  //     process.env.PROVIDER_ENDPOINT || "http://3.88.219.64:8899",
  //     {
  //       wsEndpoint: process.env.WS_ENDPOINT || "ws://3.88.219.64:8900",
  //     }
  //   ),
  //   anchor.Wallet.local()
  // );
  const providerEphemeralRollup = new anchor.AnchorProvider(
    new anchor.web3.Connection(
      process.env.PROVIDER_ENDPOINT || "https://devnet.magicblock.app/",
      {
        wsEndpoint: process.env.WS_ENDPOINT || "wss://devnet.magicblock.app/",
      }
    ),
    anchor.Wallet.local()
  );

  console.log("er public key: ", providerEphemeralRollup.wallet.publicKey);

  // // Configure base layer provider with longer timeout
  // provider.connection.confirmTransactionInitialTimeout = 120000; // 2 minutes timeout

  console.log("Base Layer Connection: ", provider.connection.rpcEndpoint);
  console.log(
    "Ephemeral Rollup Connection: ",
    providerEphemeralRollup.connection.rpcEndpoint
  );
  console.log(`Current SOL Public Key: ${anchor.Wallet.local().publicKey}`);

  const program = anchor.workspace.XplodeMoves as Program<XplodeMoves>;
  // Use local wallet as game server
  const gameServer = anchor.Wallet.local().publicKey;

  // Test data
  const gameId = `test-game-er-${Date.now()}`; // Make game ID unique for each test run
  const gridSize = 8;
  const bombPositions = [
    { x: 1, y: 1 },
    { x: 2, y: 2 },
    { x: 3, y: 3 },
    { x: 4, y: 4 },
    { x: 1, y: 2 },
    { x: 2, y: 3 },
    { x: 3, y: 4 },
    { x: 4, y: 1 },
  ];

  // Helper function to find PDA
  const findGamePda = (gameId: string) => {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("game-pda"), Buffer.from(gameId)],
      program.programId
    );
  };

  it("Initializes and delegates game to ephemeral rollup", async () => {
    try {
      const [gameMovesPda] = findGamePda(gameId);

      // Initialize game using base layer provider
      const initStart = Date.now();
      let initTx = await program.methods
        .initializeGame(gameId, gridSize, bombPositions)
        .accounts({
          // @ts-ignore
          gameMoves: gameMovesPda,
          gameServer: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .transaction();
      initTx.feePayer = provider.wallet.publicKey;
      initTx.recentBlockhash = (
        await provider.connection.getLatestBlockhash()
      ).blockhash;
      initTx = await provider.wallet.signTransaction(initTx);

      console.log("Sending init transaction...");
      try {
        const initTxHash = await provider.sendAndConfirm(initTx, [], {
          skipPreflight: true,
          commitment: "confirmed",
          maxRetries: 3,
        });
        const initDuration = Date.now() - initStart;
        console.log(
          `${initDuration}ms (Base Layer) Initialize txHash: ${initTxHash}`
        );
      } catch (err) {
        console.error("Error in base layer transaction:", err);
        throw err;
      }

      // Delegate game to ephemeral rollup using base layer provider
      const delegateStart = Date.now();
      let delegateTx = await program.methods
        .delegateGame(gameId)
        .accounts({
          pda: gameMovesPda,
          gameServer: provider.wallet.publicKey,
        })
        .transaction();
      delegateTx.feePayer = provider.wallet.publicKey;
      delegateTx.recentBlockhash = (
        await provider.connection.getLatestBlockhash()
      ).blockhash;
      delegateTx = await providerEphemeralRollup.wallet.signTransaction(
        delegateTx
      );
      const delegateTxHash = await provider.sendAndConfirm(delegateTx, [], {
        skipPreflight: true,
        commitment: "confirmed",
        maxRetries: 3,
      });
      const delegateDuration = Date.now() - delegateStart;
      console.log(
        `${delegateDuration}ms (Base Layer) Delegate txHash: ${delegateTxHash}`
      );

      // Wait for delegation to be processed
      console.log("Waiting for delegation to be processed...");
      await sleep(2000);

      // Check account on base layer
      console.log("Base Layer Account Info:");
      try {
        const baseLayerAccount = await getGameState(
          program,
          gameMovesPda,
          provider.connection
        );
        if (baseLayerAccount) {
          console.log("  Game ID:", baseLayerAccount.gameId);
          console.log("  Grid Size:", baseLayerAccount.gridSize);
          console.log("  Number of moves:", baseLayerAccount.moves.length);
          console.log("  Bomb positions:", baseLayerAccount.bombPositions);
        }
      } catch (err) {
        console.log("  Could not fetch account on base layer:", err.message);
      }

      for (let i = 0; i < 25; i++) {
        // Record moves using ephemeral rollup provider
        const move =
          i % 2 === 0
            ? {
                playerName: "sensei",
                cell: { x: i % 4, y: i % 4 },
              }
            : {
                playerName: "notlelouch",
                cell: { x: (i + 1) % 4, y: (i + 1) % 4 },
              };

        // console.log("\nAttempting to record move:", move);
        const moveStart = Date.now();
        // Get a new blockhash for the transaction
        const blockhash = (
          await providerEphemeralRollup.connection.getLatestBlockhash(
            "processed"
          )
        ).blockhash;
        const block_number =
          await providerEphemeralRollup.connection.getBlockHeight("processed");
        // console.log(`Using blockhash: ${blockhash}`);
        // console.log(`Using block number: ${block_number}`);

        let moveTx = await program.methods
          .recordMove(move.playerName, move.cell)
          .accounts({
            // @ts-ignore
            gameMoves: gameMovesPda,
            gameServer: providerEphemeralRollup.wallet.publicKey,
          })
          .transaction();

        moveTx.feePayer = providerEphemeralRollup.wallet.publicKey;
        moveTx.recentBlockhash = blockhash;
        moveTx = await providerEphemeralRollup.wallet.signTransaction(moveTx);

        try {
          console.log("Sending move transaction...");
          const moveTxHash = await providerEphemeralRollup.sendAndConfirm(
            moveTx,
            [],
            {
              skipPreflight: true,
              maxRetries: 3,
              commitment: "processed",
            }
          );
          const moveDuration = Date.now() - moveStart;
          console.log("Move: ", move.playerName, move.cell);
          console.log(`${moveDuration}ms (ER) Move txHash: ${moveTxHash}`);
          await sleep(100);

          // // Verify move was recorded immediately after transaction
          // console.log("\nVerifying move was recorded...");
          // const gameState = await getGameState(
          //   program,
          //   gameMovesPda,
          //   providerEphemeralRollup.connection
          // );
          // if (gameState) {
          //   console.log("Current game state after move:");
          //   console.log("  Number of moves:", gameState.moves.length);
          //   if (gameState.moves.length > 0) {
          //     console.log(
          //       "  Latest move:",
          //       gameState.moves[gameState.moves.length - 1]
          //     );
          //   }
          // }
        } catch (e) {
          console.error("Transaction failed:", e.message);
          if (e.logs) {
            console.error("Transaction logs:", e.logs);
          }
          throw e;
        }
      }

      // Commit and undelegate
      const commitStart = Date.now();
      let commitTx = await program.methods
        .commitAndUndelegateGame()
        .accounts({
          // @ts-ignore
          gameMoves: gameMovesPda,
          gameServer: providerEphemeralRollup.wallet.publicKey,
        })
        .transaction();
      commitTx.feePayer = providerEphemeralRollup.wallet.publicKey;
      commitTx.recentBlockhash = (
        await providerEphemeralRollup.connection.getLatestBlockhash()
      ).blockhash;
      commitTx = await providerEphemeralRollup.wallet.signTransaction(commitTx);
      const commitTxHash = await providerEphemeralRollup.sendAndConfirm(
        commitTx,
        [],
        {
          skipPreflight: true,
          maxRetries: 3,
        }
      );
      const commitDuration = Date.now() - commitStart;
      console.log(
        `${commitDuration}ms (ER) Commit and Undelegate txHash: ${commitTxHash}`
      );

      // Wait longer for transaction to be processed
      console.log("Waiting for transaction to be processed (5s)...");
      await sleep(10000);

      try {
        // Try to get the commitment signature
        const commitSignature = await GetCommitmentSignature(
          commitTxHash,
          providerEphemeralRollup.connection
        );
        console.log("Commitment signature:", commitSignature);
      } catch (err) {
        console.warn("Could not get commitment signature:", err.message);
        console.log("This is not critical - continuing with test...");
      }

      // // Wait for potential auto-commit (commit frequency is 500ms)
      // console.log(`\nWaiting for auto-commit (1000ms)...`);
      await sleep(5000);
      // await sleep(10000);

      // Verify move was recorded
      const gameAccount = await program.account.gameMoves.fetch(gameMovesPda);
      console.log("Game account moves: ", gameAccount.moves.length);
      // expect(gameAccount.moves).to.have.lengthOf(1);
      // expect(gameAccount.moves[0].playerName).to.equal(move.playerName);
      // expect(gameAccount.moves[0].cell).to.deep.equal(move.cell);
    } catch (err) {
      console.error("Error in ephemeral rollup test:", err);
      if (
        err instanceof Error &&
        err.message.includes("Transaction was not confirmed")
      ) {
        console.log(
          "Note: Transaction might have succeeded but timed out waiting for confirmation"
        );
        console.log("Check the transaction signature in the Solana Explorer");
      }
      throw err;
    }
  });
});
