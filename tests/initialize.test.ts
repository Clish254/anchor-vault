import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AnchorVault } from "../target/types/anchor_vault";
import web3, { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { COMMITMENT, createMint, createTokenAccount, getPDAs } from "./utils";

import { expect } from "chai";

describe("anchor-vault", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const { connection } = provider;
  const program = anchor.workspace.AnchorVault as Program<AnchorVault>;

  it("Initialize vault", async () => {
    try {
      const vaultOwner = provider.wallet.publicKey;

      const vaultUser = new Keypair();
      const mint = await createMint(provider);
      const { vault, vaultTokenAccount, vaultAuthority } = await getPDAs({
        vaultOwner,
        vaultUser: vaultUser.publicKey,
        programId: program.programId,
        mint,
      });
      const initializeTransaction = await program.methods
        .initializeVault()
        .accounts({
          owner: vaultOwner,
          mint,
          vault,
          vaultAuthority,
          vaultTokenAccount,
        })
        .rpc(COMMITMENT);
      console.log(`[Initialize] ${initializeTransaction}`);

      const vaultData = await program.account.vault.fetch(vault);
      console.log(vaultData);
      expect(vaultData.owner.toBase58()).to.eq(vaultOwner.toBase58());
      expect(vaultData.initialized).to.eq(true);
      expect(vaultData.depositedAmount.toNumber()).to.eq(0);
      expect(vaultData.withdrawnAmount.toNumber()).to.eq(0);
      expect(vaultData.mint.toBase58()).to.eql(mint.toBase58());
      expect(vaultData.bumps.vault).to.not.eql(0);
      expect(vaultData.bumps.vaultAuthority).to.not.eql(0);
      expect(vaultData.bumps.vaultTokenAccount).to.not.eql(0);
    } catch (error) {
      console.error(error);
      throw new error();
    }
  });
});
