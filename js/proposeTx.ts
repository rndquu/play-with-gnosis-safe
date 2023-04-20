/**
 * This script proposes a new gnosis safe transaction.
 * Proposing a transaction simply means API request to gnosis safe tx service.
 * Example of the proposed transaction: https://app.safe.global/gor:0x839F2406464B98128c67c00dB9408F07bB9D4629/transactions/tx?id=multisig_0x839F2406464B98128c67c00dB9408F07bB9D4629_0x76eda2e634a443df5274b56d67fc2e888c056ff766dffc50c00c3c16c21d68e2
 */

import Safe from "@safe-global/safe-core-sdk";
import { OperationType, SafeTransactionDataPartial } from "@safe-global/safe-core-sdk-types";
import EthersAdapter from "@safe-global/safe-ethers-lib";
import SafeServiceClient from "@safe-global/safe-service-client";
import { ethers } from "ethers";
import DAI_ABI from "./DAI_abi.json";

const config = {
  CHAIN_ID: 5, // mainnet: 1, goerli: 5
  RPC_URL: "https://goerli.infura.io/v3/0697ca1ac6d04ea7a86a146e53452fb9",
  BOT_PRIVATE_KEY: "0xa3bfde12b832ab44f303ecb8acfb5042190f357ec7712a8597c29ba1e1a31708",
  SAFE_ADDRESS: "0x839F2406464B98128c67c00dB9408F07bB9D4629",
  TX_SERVICE_URL: "https://safe-transaction-goerli.safe.global/", // Check https://docs.safe.global/backend/available-services
  DAI_ADDRESS: "0x11fE4B6AE13d2a6055C8D9cF65c55bac32B5d844", // mainnet: 0x6B175474E89094C44Da98b954EedeAC495271d0F, goerli: 0x11fE4B6AE13d2a6055C8D9cF65c55bac32B5d844
  BOUNTY_HUNTER_ADDRESS: "0x9694227ef9516A6AB4FBF30039686E5f1AeF0b41",
  BOUNTY_HUNTER_REWARD_ETH: 1,
};

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(config.RPC_URL);
  const signer = new ethers.Wallet(config.BOT_PRIVATE_KEY, provider);

  // create EthAdapter instance
  const ethAdapter = new EthersAdapter({
    ethers,
    signerOrProvider: signer,
  });

  // create Safe instance
  const safe = await Safe.create({
    ethAdapter,
    safeAddress: config.SAFE_ADDRESS,
  });

  // Create Safe Service Client instance
  const service = new SafeServiceClient({
    txServiceUrl: config.TX_SERVICE_URL,
    ethAdapter,
  });

  // create DAI contract instance
  const daiContract = new ethers.Contract(config.DAI_ADDRESS, DAI_ABI);
  const transferData = await daiContract.populateTransaction.transfer(
    config.BOUNTY_HUNTER_ADDRESS,
    ethers.utils.parseEther(String(config.BOUNTY_HUNTER_REWARD_ETH)).toString()
  );

  // get next safe tx nonce (safe nonces are different from EOA nonces)
  // next nonce is the next nonce after the last queued (not yet executed) transaction
  const nextNonce = await service.getNextNonce(config.SAFE_ADDRESS);

  // create transaction
  const safeTransactionData: SafeTransactionDataPartial = {
    to: config.DAI_ADDRESS,
    value: "0", // in wei
    data: String(transferData.data),
    operation: OperationType.Call,
    nonce: nextNonce,
  };
  const safeTransaction = await safe.createTransaction({ safeTransactionData });

  // Propose transaction to the service
  const senderAddress = await signer.getAddress();
  const safeTxHash = await safe.getTransactionHash(safeTransaction);
  const signature = await safe.signTransactionHash(safeTxHash);

  await service.proposeTransaction({
    safeAddress: config.SAFE_ADDRESS,
    safeTransactionData: safeTransaction.data,
    safeTxHash,
    senderAddress,
    senderSignature: signature.data,
  });

  console.log(
    `Transaction URL: https://app.safe.global/${config.CHAIN_ID === 5 ? "gor" : "eth"}:${config.SAFE_ADDRESS}/transactions/tx?id=multisig_${
      config.SAFE_ADDRESS
    }_${safeTxHash}`
  );
}

main();
