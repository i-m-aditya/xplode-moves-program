// import * as anchor from "@coral-xyz/anchor";
// import { Program } from "@coral-xyz/anchor";
// import { XplodeMoves } from "../target/types/xplode_moves";
// import { expect } from "chai";

// describe("xplode-moves", () => {
//   // Configure the client to use the local cluster
//   const provider = anchor.AnchorProvider.env();
//   anchor.setProvider(provider);

//   const program = anchor.workspace.XplodeMoves as Program<XplodeMoves>;
//   // Use local wallet as game server
//   const gameServer = anchor.Wallet.local().publicKey;

//   // Test data
//   const gameId = "test-game-1";
//   const gridSize = 5;
//   const bombPositions = [
//     { x: 1, y: 1 },
//     { x: 2, y: 2 },
//     { x: 3, y: 3 },
//   ];

//   // Helper function to find PDA
//   const findGamePda = (gameId: string) => {
//     return anchor.web3.PublicKey.findProgramAddressSync(
//       [Buffer.from("game-pda"), Buffer.from(gameId)],
//       program.programId
//     );
//   };

//   // Reset game state before each test
//   beforeEach(async () => {
//     try {
//       const [gameMovesPda] = findGamePda(gameId);
//       // Initialize with empty state
//       await program.methods
//         .initializeGame(gameId, gridSize, bombPositions)
//         .accounts({
//           // @ts-ignore
//           gameMoves: gameMovesPda,
//           gameServer: gameServer,
//           systemProgram: anchor.web3.SystemProgram.programId,
//         })
//         .rpc();
//     } catch (err) {
//       // Ignore errors if account doesn't exist
//       console.log("Reset state:", err.message);
//     }
//   });

//   it("Initializes a new game", async () => {
//     try {
//       const [gameMovesPda] = findGamePda(gameId);
//       const tx = await program.methods
//         .initializeGame(gameId, gridSize, bombPositions)
//         .accounts({
//           // @ts-ignore
//           gameMoves: gameMovesPda,
//           gameServer: gameServer,
//           systemProgram: anchor.web3.SystemProgram.programId,
//         })
//         .rpc();

//       console.log("Initialize game transaction signature:", tx);

//       // Fetch the game account
//       const gameAccount = await program.account.gameMoves.fetch(gameMovesPda);

//       // Verify game data
//       expect(gameAccount.gameId).to.equal(gameId);
//       expect(gameAccount.gridSize).to.equal(gridSize);
//       expect(gameAccount.bombPositions).to.deep.equal(bombPositions);
//       expect(gameAccount.moves).to.be.an("array").that.is.empty;
//     } catch (err) {
//       console.error("Error initializing game:", err);
//       throw err;
//     }
//   });

//   it("Records a move", async () => {
//     try {
//       const [gameMovesPda] = findGamePda(gameId);
//       const move = {
//         playerName: "player1",
//         cell: { x: 0, y: 0 },
//       };

//       const tx = await program.methods
//         .recordMove(move.playerName, move.cell)
//         .accounts({
//           // @ts-ignore
//           gameMoves: gameMovesPda,
//           gameServer: gameServer,
//         })
//         .rpc();

//       console.log("Record move transaction signature:", tx);

//       // Fetch the game account
//       const gameAccount = await program.account.gameMoves.fetch(gameMovesPda);

//       // Verify move was recorded
//       expect(gameAccount.moves).to.have.lengthOf(1);
//       expect(gameAccount.moves[0].playerName).to.equal(move.playerName);
//       expect(gameAccount.moves[0].cell).to.deep.equal(move.cell);
//     } catch (err) {
//       console.error("Error recording move:", err);
//       throw err;
//     }
//   });

//   it("Records multiple moves in sequence", async () => {
//     try {
//       const [gameMovesPda] = findGamePda(gameId);
//       const moves = [
//         { playerName: "player1", cell: { x: 0, y: 0 } },
//         { playerName: "player2", cell: { x: 1, y: 0 } },
//         { playerName: "player1", cell: { x: 0, y: 1 } },
//       ];

//       // Record each move
//       for (const move of moves) {
//         const tx = await program.methods
//           .recordMove(move.playerName, move.cell)
//           .accounts({
//             // @ts-ignore
//             gameMoves: gameMovesPda,
//             gameServer: gameServer,
//           })
//           .rpc();
//         console.log(
//           `Record move transaction signature for ${move.playerName}:`,
//           tx
//         );
//       }

//       // Fetch the game account
//       const gameAccount = await program.account.gameMoves.fetch(gameMovesPda);

//       // Verify all moves were recorded
//       expect(gameAccount.moves).to.have.lengthOf(3);

//       // Verify each move in sequence
//       moves.forEach((expectedMove, index) => {
//         const recordedMove = gameAccount.moves[index];
//         expect(recordedMove.playerName).to.equal(expectedMove.playerName);
//         expect(recordedMove.cell).to.deep.equal(expectedMove.cell);
//       });
//     } catch (err) {
//       console.error("Error recording multiple moves:", err);
//       throw err;
//     }
//   });

//   it("Fails to record move with invalid coordinates", async () => {
//     try {
//       const [gameMovesPda] = findGamePda(gameId);
//       const playerName = "player1";
//       const invalidCell = { x: gridSize + 1, y: gridSize + 1 };

//       await program.methods
//         .recordMove(playerName, invalidCell)
//         .accounts({
//           // @ts-ignore
//           gameMoves: gameMovesPda,
//           gameServer: gameServer,
//         })
//         .rpc();

//       // If we reach here, the test should fail
//       expect.fail("Should have thrown an error for invalid coordinates");
//     } catch (err) {
//       // Verify the error is what we expect
//       expect(err.toString()).to.include("InvalidCell");
//     }
//   });

//   it("Supports multiple concurrent games", async () => {
//     try {
//       const gameId2 = "test-game-2";
//       const [gameMovesPda1] = findGamePda(gameId);
//       const [gameMovesPda2] = findGamePda(gameId2);

//       // Initialize first game
//       let tx = await program.methods
//         .initializeGame(gameId, gridSize, bombPositions)
//         .accounts({
//           // @ts-ignore
//           gameMoves: gameMovesPda1,
//           gameServer: gameServer,
//           systemProgram: anchor.web3.SystemProgram.programId,
//         })
//         .rpc();

//       console.log("Initialize game transaction signature:", tx);

//       // Initialize second game
//       tx = await program.methods
//         .initializeGame(gameId2, gridSize, bombPositions)
//         .accounts({
//           // @ts-ignore
//           gameMoves: gameMovesPda2,
//           gameServer: gameServer,
//           systemProgram: anchor.web3.SystemProgram.programId,
//         })
//         .rpc();
//       console.log("Initialize game transaction signature:", tx);

//       // Record moves in first game
//       tx = await program.methods
//         .recordMove("player1", { x: 0, y: 0 })
//         .accounts({
//           // @ts-ignore
//           gameMoves: gameMovesPda1,
//           gameServer: gameServer,
//         })
//         .rpc();
//       console.log("Record move transaction signature:", tx);

//       // Record moves in second game
//       tx = await program.methods
//         .recordMove("player2", { x: 0, y: 0 })
//         .accounts({
//           // @ts-ignore
//           gameMoves: gameMovesPda2,
//           gameServer: gameServer,
//         })
//         .rpc();
//       console.log("Record move transaction signature:", tx);
//       // Verify both games have their moves
//       const game1Account = await program.account.gameMoves.fetch(gameMovesPda1);
//       const game2Account = await program.account.gameMoves.fetch(gameMovesPda2);

//       expect(game1Account.moves).to.have.lengthOf(1);
//       expect(game1Account.moves[0].playerName).to.equal("player1");
//       expect(game2Account.moves).to.have.lengthOf(1);
//       expect(game2Account.moves[0].playerName).to.equal("player2");
//     } catch (err) {
//       console.error("Error testing concurrent games:", err);
//       throw err;
//     }
//   });
// });
