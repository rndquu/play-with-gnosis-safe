/**
 * Relays TX for Counter.increment()
 *
 * Counter contract address: https://goerli.etherscan.io/address/0xeeebe2f778aa186e88dcf2feb8f8231565769c27
 * Counter contract ABI: https://github.com/gelatodigital/relay-docs-examples/tree/master/src/examples/relayWithSyncFee#countersol
 *
 * How it works:
 * 1. Contract is prepaid with DAI
 * 2. This script is called, gelato network sends the TX and pays for gas (GelatoRelay.getEstimatedFee() gets a fee in ETH or ERC20 tokens)
 * 3. On "increment()" execution "_transferRelayFee()" is called which sends DAI to fee collector set by gelato network
 *
 * Example TX: https://goerli.etherscan.io/tx/0x26d53c6b56c47af0af8b8feb509b78011154fd8fc47a6ca37f66c572708b7a3d
 */

import { GelatoRelay, CallWithSyncFeeRequest } from "@gelatonetwork/relay-sdk";
import { ethers, BytesLike, BigNumber } from "ethers";

import Counter from "./Counter_abi.json";
import DAI_ABI from "./DAI_abi.json";

const config = {
  RPC_URL: "https://goerli.infura.io/v3/0697ca1ac6d04ea7a86a146e53452fb9",
  CHAIN_ID: 5, // mainnet: 1, goerli: 5
  CONTRACT_ADDRESS: "0xEEeBe2F778AA186e88dCf2FEb8f8231565769C27", // counter adddress, https://blockscan.com/address/0xEEeBe2F778AA186e88dCf2FEb8f8231565769C27
  DAI_ADDRESS: "0x11fE4B6AE13d2a6055C8D9cF65c55bac32B5d844",
};

async function main() {
  const counterInterface = new ethers.utils.Interface(Counter.abi);
  const data = counterInterface.encodeFunctionData("increment");
  const feeToken = config.DAI_ADDRESS; // pay Gelato in native token

  // show Counter contract's DAI balance
  // const provider = new ethers.providers.JsonRpcProvider(config.RPC_URL, config.CHAIN_ID);
  // const daiContract = new ethers.Contract(config.DAI_ADDRESS, DAI_ABI, provider);
  // const counterDaiBalance = await daiContract.balanceOf(config.CONTRACT_ADDRESS);
  // console.log(ethers.utils.formatEther(counterDaiBalance.toString()));
  // return;

  // populate the relay SDK request body
  const request: CallWithSyncFeeRequest = {
    chainId: config.CHAIN_ID,
    target: config.CONTRACT_ADDRESS,
    data: data as BytesLike,
    feeToken: feeToken,
  };

  const relay = new GelatoRelay();

  // get oracle info with estimated fee
  console.log("Is oracle active:", await relay.isOracleActive(config.CHAIN_ID));
  console.log("Payment tokens:", await relay.getPaymentTokens(config.CHAIN_ID));
  console.log(
    "Estimated fee:",
    ethers.utils.formatEther((await relay.getEstimatedFee(config.CHAIN_ID, config.DAI_ADDRESS, BigNumber.from(150_000), true)).toString())
  );

  const relayResponse = await relay.callWithSyncFee(request);
  console.log(`https://relay.gelato.digital/tasks/status/${relayResponse.taskId}`);
}

main();
