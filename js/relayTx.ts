/**
 * Relays execution of a safe transaction via gelato network
 * 
 * Success task: https://relay.gelato.digital/tasks/status/0xfb3aacc673b5dcf1e4a01ba15617b2956e2cbdebc882b080664ae100ddb92cbc
 * Success tx: https://polygonscan.com/tx/0x97590e4e35e6363b3f355f65e2ca606573ad4ce5eac8ddb8ce4d4320982baea4
 */

import { GelatoRelay, CallWithSyncFeeRequest } from "@gelatonetwork/relay-sdk";
import EthersAdapter from "@safe-global/safe-ethers-lib";
import SafeServiceClient from "@safe-global/safe-service-client";
import * as dotenv from 'dotenv';
import { BytesLike, ethers } from "ethers";
import GNOSIS_SAFE from "./gnosis_safe.json";

dotenv.config();

async function main() {
    // create EthAdapter instance
    const ethAdapter = new EthersAdapter({
        ethers,
        signerOrProvider: new ethers.providers.JsonRpcProvider(process.env.RPC_URL),
    });

    // Create Safe Service Client instance
    const service = new SafeServiceClient({
        txServiceUrl: String(process.env.SAFE_TX_SERVICE_URL),
        ethAdapter,
    });

    // get pending txs
    const pendingTxs = await service.getPendingTransactions(String(process.env.SAFE_ADDRESS));
    if (pendingTxs.results.length > 0) {
        // get latest pending tx
        const latestPendingTx = pendingTxs.results[pendingTxs.results.length - 1];

        // if latest pending tx is signed by all parties
        if (latestPendingTx.confirmations?.length === latestPendingTx.confirmationsRequired) {
            // prepare tx data
            const safeContract = new ethers.Contract(String(process.env.SAFE_ADDRESS), GNOSIS_SAFE.abi);
            const execTransactionData = await safeContract.populateTransaction.execTransaction(
                latestPendingTx.to, // destination address of safe tx, DAI address
                0, // ether value
                latestPendingTx.data, // data payload of safe tx
                0, // operation, call or delegatecall
                String(50_000), // safe tx gas
                String(100000000), // base gas
                1000000000, // gas price
                process.env.DAI_ADDRESS, // gas token used for payment (0x0 for ETH)
                process.env.GELATO_REFUND_ADDRESS, // refund receiver
                `0x${latestPendingTx.confirmations[0].signature.replace("0x", "")}${latestPendingTx.confirmations[1].signature.replace("0x", "")}` // signatures
            );
            
            // relay tx
            const relay = new GelatoRelay();
            const request: CallWithSyncFeeRequest = {
                chainId: String(process.env.CHAIN_ID),
                target: String(execTransactionData.to),
                data: execTransactionData.data as BytesLike,
                feeToken: String(process.env.DAI_ADDRESS),
            };
            const response = await relay.callWithSyncFee(request);
            console.log(`Check execution status here: https://relay.gelato.digital/tasks/status/${response.taskId}`);
        } else {
            console.log("Not enough signatures for latest pending transaction");
        }
    } else {
        console.log("There are no pending transactions");
    }
}

main();
