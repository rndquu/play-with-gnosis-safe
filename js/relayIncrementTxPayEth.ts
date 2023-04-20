/**
 * Relays TX for Counter.increment()
 *
 * Counter contract address: https://goerli.etherscan.io/address/0xeeebe2f778aa186e88dcf2feb8f8231565769c27
 * Counter contract ABI: https://github.com/gelatodigital/relay-docs-examples/tree/master/src/examples/relayWithSyncFee#countersol
 *
 * How it works:
 * 1. Contract is prepaid with ETH
 * 2. This script is called, gelato network sends the TX and pays for gas
 * 3. On "increment()" execution "_transferRelayFee()" is called which sends ETH to fee collector set by gelato network
 *
 * Example TX: https://goerli.etherscan.io/tx/0x00723510ce94f474132c54226ae1aa6152a260d36faec117452fdf6e5a4fb9e2
 */

import { GelatoRelay, CallWithSyncFeeRequest } from "@gelatonetwork/relay-sdk";
import { ethers, BytesLike } from "ethers";

import Counter from "./Counter_abi.json";

const config = {
  RPC_URL: "https://goerli.infura.io/v3/0697ca1ac6d04ea7a86a146e53452fb9",
  CHAIN_ID: 5, // mainnet: 1, goerli: 5
  CONTRACT_ADDRESS: "0xEEeBe2F778AA186e88dCf2FEb8f8231565769C27", // counter adddress, https://blockscan.com/address/0xEEeBe2F778AA186e88dCf2FEb8f8231565769C27
};

async function main() {
  const counterInterface = new ethers.utils.Interface(Counter.abi);
  const data = counterInterface.encodeFunctionData("increment");
  const feeToken = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"; // pay Gelato in native token

  // get current counter value
  // const provider = new ethers.providers.JsonRpcProvider(config.RPC_URL, config.CHAIN_ID);
  // const counterContract = new ethers.Contract(config.CONTRACT_ADDRESS, Counter.abi, provider);
  // const counterValue = await counterContract.counter();
  // console.log(counterValue.toNumber());
  // return;

  // populate the relay SDK request body
  const request: CallWithSyncFeeRequest = {
    chainId: config.CHAIN_ID,
    target: config.CONTRACT_ADDRESS,
    data: data as BytesLike,
    feeToken: feeToken,
  };

  const relay = new GelatoRelay();
  const relayResponse = await relay.callWithSyncFee(request);

  console.log(`https://relay.gelato.digital/tasks/status/${relayResponse.taskId}`);
}

main();
