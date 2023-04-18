// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import 'forge-std/Test.sol';
import 'forge-std/console.sol';
import 'openzeppelin-contracts/contracts/token/ERC20/presets/ERC20PresetFixedSupply.sol';
import 'safe-contracts/GnosisSafe.sol';
import 'safe-contracts/proxies/GnosisSafeProxy.sol';
import 'safe-contracts/proxies/GnosisSafeProxyFactory.sol';

/**
 * TODO:
 * + create a safe 1/1
 * + execute tx to transfer ETH from 1/1 safe
 * + create a safe 2/2
 * + execute tx to transfer ETH from 2/2 safe
 * + relay tx to transfer ETH from 1/1 safe
 * + relay tx to transfer ETH from 2/2 safe
 * - relay tx to transfer DAI from 1/1 safe
 * - relay tx to transfer DAI from 2/2 safe
 *
 * How to test: forge test --via-ir -vv --gas-price 20000000000 
 * Notice: we need to set "--gas-price" because we need it for refund calculation else forge sets gas price to 0
 */
contract MySafeTest is Test {

    GnosisSafeProxyFactory safeProxyFactory;
    GnosisSafe safeSingleton;
    GnosisSafeProxy safeProxy;
    GnosisSafe safe;

    uint pkUser1 = 101;
    uint pkUser2 = 102;
    uint pkUser3 = 103;
    uint pkGelatoRelayer = 104;
    uint pkGelatoRefundReceiver = 105;
    address user1;
    address user2;
    address user3;
    address gelatoRelayer;
    address gelatoRefundReceiver;

    function setUp() public {
        // setup user addresses
        user1 = vm.addr(pkUser1);
        user2 = vm.addr(pkUser2);
        user3 = vm.addr(pkUser3);
        gelatoRelayer = vm.addr(pkGelatoRelayer);
        gelatoRefundReceiver = vm.addr(pkGelatoRefundReceiver);

        // create proxy factory
        safeProxyFactory = new GnosisSafeProxyFactory();
        // create a singleton safe
        safeSingleton = new GnosisSafe();
        // create safe proxy
        safeProxy = safeProxyFactory.createProxy(address(safeSingleton), bytes('0x00'));
        // create safe instance
        safe = GnosisSafe(payable(address(safeProxy)));
    }

    function testCreateSafeOneOfOne() public {
        // init safe
        address[] memory owners = new address[](1);
        owners[0] = user1;
        safe.setup(
            owners, // array of owners
            1, // number of required confirmations for a Safe transaction
            address(0), // contract address for optional delegate call
            bytes('0x00'), // data payload for optional delegate call
            address(0), // handler for fallback calls to this contract
            address(0), // token that should be used for the payment (0 is ETH)
            0, // value that should be paid
            payable(address(0)) // adddress that should receive the payment (or 0 if tx.origin)
        );

        emit log_uint(safe.getThreshold()); 
        address[] memory ownerAfterInit = safe.getOwners();
        console.log('Address:', ownerAfterInit[0]);
    }

    function testSendEthFromOneOfOneSafe() public {
        // init safe
        address[] memory owners = new address[](1);
        owners[0] = user1;
        safe.setup(
            owners, // array of owners
            1, // number of required confirmations for a Safe transaction
            address(0), // contract address for optional delegate call
            bytes('0x00'), // data payload for optional delegate call
            address(0), // handler for fallback calls to this contract
            address(0), // token that should be used for the payment (0 is ETH)
            0, // value that should be paid
            payable(address(0)) // adddress that should receive the payment (or 0 if tx.origin)
        );

        // increase user1 balance
        vm.deal(user1, 100 ether);
        // user1 sends 10 ETH to safe
        vm.prank(user1);
        payable(address(safe)).transfer(10 ether);

        console.log('===balances before===');
        console.log('Balance (user1):', user1.balance);
        console.log('Balance (user2):', user2.balance);
        console.log('Balance (safe) :', address(safe).balance);

        // get tx hash
        bytes32 txHash = safe.getTransactionHash(
            user2, // destination address
            1 ether, // ether value
            bytes(''), // data payload
            Enum.Operation.Call, // operation type
            0, // gas that should be used for the safe transaction
            0, // gas costs for data used to trigger the safe transaction
            0, // maximum gas price that should be used for this transaction
            address(0), // token address (or 0 if ETH) that is used for the payment
            address(0), // address of receiver of gas payment (or 0 if tx.origin)
            safe.nonce() // transaction nonce
        );
        // sign tx hash to get (r,s,v)
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pkUser1, txHash);
        
        // execute tx (relay via any user)
        safe.execTransaction(
            user2, // destination address
            1 ether, // ether value
            bytes(''), // data payload 
            Enum.Operation.Call, // operation type
            0, // gas that should be used for the safe transaction 
            0, // gas costs for data used to trigger the safe transaction 
            0, // maximum gas price that should be used for this transaction
            address(0), // token address (or 0 if ETH) that is used for the payment
            payable(address(0)), // address of receiver of gas payment (or 0 if tx.origin)
            abi.encodePacked(r, s, v) // packed signature data ({bytes32 r}{bytes32 s}{uint8 v})
        );

        console.log('===balances after===');
        console.log('Balance (user1):', user1.balance);
        console.log('Balance (user2):', user2.balance);
        console.log('Balance (safe) :', address(safe).balance);
    }

    function testSendEthFromTwoOfTwoSafe() public {
        // init safe
        address[] memory owners = new address[](2);
        owners[0] = user1;
        owners[1] = user2;
        safe.setup(
            owners, // array of owners
            2, // number of required confirmations for a Safe transaction
            address(0), // contract address for optional delegate call
            bytes('0x00'), // data payload for optional delegate call
            address(0), // handler for fallback calls to this contract
            address(0), // token that should be used for the payment (0 is ETH)
            0, // value that should be paid
            payable(address(0)) // adddress that should receive the payment (or 0 if tx.origin)
        );
        address[] memory ownerAfterInit = safe.getOwners();
        console.log('Owner 1:', ownerAfterInit[0]);
        console.log('Owner 2:', ownerAfterInit[1]);

        // increase user1 balance
        vm.deal(user1, 100 ether);
        // user1 sends 10 ETH to safe
        vm.prank(user1);
        payable(address(safe)).transfer(10 ether);

        console.log('===balances before===');
        console.log('Balance (user1):', user1.balance);
        console.log('Balance (user3):', user3.balance);
        console.log('Balance (safe) :', address(safe).balance);

        // get tx hash for user1
        bytes32 txHashUser1 = safe.getTransactionHash(
            user3, // destination address
            1 ether, // ether value
            bytes(''), // data payload
            Enum.Operation.Call, // operation type
            0, // gas that should be used for the safe transaction
            0, // gas costs for data used to trigger the safe transaction
            0, // maximum gas price that should be used for this transaction
            address(0), // token address (or 0 if ETH) that is used for the payment
            address(0), // address of receiver of gas payment (or 0 if tx.origin)
            safe.nonce() // transaction nonce
        );
        // sign tx hash to get (r,s,v)
        (uint8 vUser1, bytes32 rUser1, bytes32 sUser1) = vm.sign(pkUser1, txHashUser1);

        // get tx hash for user2
        bytes32 txHashUser2 = safe.getTransactionHash(
            user3, // destination address
            1 ether, // ether value
            bytes(''), // data payload
            Enum.Operation.Call, // operation type
            0, // gas that should be used for the safe transaction
            0, // gas costs for data used to trigger the safe transaction
            0, // maximum gas price that should be used for this transaction
            address(0), // token address (or 0 if ETH) that is used for the payment
            address(0), // address of receiver of gas payment (or 0 if tx.origin)
            safe.nonce() // transaction nonce
        );
        // sign tx hash to get (r,s,v)
        (uint8 vUser2, bytes32 rUser2, bytes32 sUser2) = vm.sign(pkUser2, txHashUser2);

        // execute tx (relay via any user)
        safe.execTransaction(
            user3, // destination address
            1 ether, // ether value
            bytes(''), // data payload 
            Enum.Operation.Call, // operation type
            0, // gas that should be used for the safe transaction 
            0, // gas costs for data used to trigger the safe transaction 
            0, // maximum gas price that should be used for this transaction
            address(0), // token address (or 0 if ETH) that is used for the payment
            payable(address(0)), // address of receiver of gas payment (or 0 if tx.origin)
            // NOTICE: order matters, from last owner to the 1st owner
            abi.encodePacked(rUser2, sUser2, vUser2, rUser1, sUser1, vUser1) // packed signature data ({bytes32 r}{bytes32 s}{uint8 v})
        );

        console.log('===balances after===');
        console.log('Balance (user1):', user1.balance);
        console.log('Balance (user3):', user3.balance);
        console.log('Balance (safe) :', address(safe).balance);
    }

    function testSendEthFromOneOfOneSafeViaRelayer() public {
        // init safe
        address[] memory owners = new address[](1);
        owners[0] = user1;
        safe.setup(
            owners, // array of owners
            1, // number of required confirmations for a Safe transaction
            address(0), // contract address for optional delegate call
            bytes('0x00'), // data payload for optional delegate call
            address(0), // handler for fallback calls to this contract
            address(0), // token that should be used for the payment (0 is ETH)
            0, // value that should be paid
            payable(address(0)) // adddress that should receive the payment (or 0 if tx.origin)
        );

        // increase user1 balance
        vm.deal(user1, 100 ether);
        // user1 sends 10 ETH to safe
        vm.prank(user1);
        payable(address(safe)).transfer(10 ether);

        console.log('===balances before===');
        console.log('Balance (user1):                 ', user1.balance);
        console.log('Balance (user2):                 ', user2.balance);
        console.log('Balance (safe):                  ', address(safe).balance);
        console.log('Balance (gelato relayer):        ', address(gelatoRelayer).balance);
        console.log('Balance (gelato refund receiver):', address(gelatoRefundReceiver).balance);

        // payment params to play with
        uint safeTxGas = 0;
        uint baseGas = 1000000000000000000;
        uint gasPrice = 1; // 1 wei, always smallet amount is used

        // get tx hash
        bytes32 txHash = safe.getTransactionHash(
            user2, // destination address
            1 ether, // ether value
            bytes(''), // data payload
            Enum.Operation.Call, // operation type
            safeTxGas, // gas that should be used for the safe transaction
            baseGas, // gas costs for data used to trigger the safe transaction
            gasPrice, // maximum gas price that should be used for this transaction
            address(0), // token address (or 0 if ETH) that is used for the payment
            gelatoRefundReceiver, // address of receiver of gas payment (or 0 if tx.origin)
            safe.nonce() // transaction nonce
        );
        // sign tx hash to get (r,s,v)
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pkUser1, txHash);
        
        // execute tx by gelator relayer
        vm.prank(gelatoRelayer);
        safe.execTransaction(
            user2, // destination address
            1 ether, // ether value
            bytes(''), // data payload 
            Enum.Operation.Call, // operation type
            safeTxGas, // gas that should be used for the safe transaction 
            baseGas, // gas costs for data used to trigger the safe transaction 
            gasPrice, // maximum gas price that should be used for this transaction
            address(0), // token address (or 0 if ETH) that is used for the payment
            payable(gelatoRefundReceiver), // address of receiver of gas payment (or 0 if tx.origin)
            abi.encodePacked(r, s, v) // packed signature data ({bytes32 r}{bytes32 s}{uint8 v})
        );

        console.log('===balances after===');
        console.log('Balance (user1):                 ', user1.balance);
        console.log('Balance (user2):                 ', user2.balance);
        console.log('Balance (safe):                  ', address(safe).balance);
        console.log('Balance (gelato relayer):        ', address(gelatoRelayer).balance);
        console.log('Balance (gelato refund receiver):', address(gelatoRefundReceiver).balance);
    }

    function testSendEthFromTwoOfTwoSafeViaRelayer() public {
        // init safe
        address[] memory owners = new address[](2);
        owners[0] = user1;
        owners[1] = user2;
        safe.setup(
            owners, // array of owners
            2, // number of required confirmations for a Safe transaction
            address(0), // contract address for optional delegate call
            bytes('0x00'), // data payload for optional delegate call
            address(0), // handler for fallback calls to this contract
            address(0), // token that should be used for the payment (0 is ETH)
            0, // value that should be paid
            payable(address(0)) // adddress that should receive the payment (or 0 if tx.origin)
        );

        // increase user1 balance
        vm.deal(user1, 100 ether);
        // user1 sends 2 ETH to safe
        vm.prank(user1);
        payable(address(safe)).transfer(2 ether);

        console.log('===balances before===');
        console.log('Balance (user1):                 ', user1.balance);
        console.log('Balance (user2):                 ', user2.balance);
        console.log('Balance (user3):                 ', user3.balance);
        console.log('Balance (safe):                  ', address(safe).balance);
        console.log('Balance (gelato relayer):        ', address(gelatoRelayer).balance);
        console.log('Balance (gelato refund receiver):', address(gelatoRefundReceiver).balance);
        
        // payment params to play with
        uint safeTxGas = 0;
        uint baseGas = 5000000000; // 5 gwei
        uint gasPrice = 1; // 1 wei, always smallet amount is used
        uint txFee = baseGas * gasPrice;
        uint bountyHunterReward = 1 ether - txFee;

        // estimate gas left before the relayer payout
        uint estimatedTxGas = 0;
        try safe.requiredTxGas(user3, bountyHunterReward, bytes(''), Enum.Operation.Call) returns (uint result) {
            // empty
        } catch Error(string memory reason) {
            bytes32 reasonBytes32;
            assembly {
                reasonBytes32 := mload(add(reason, 32))
            }
            estimatedTxGas = uint(reasonBytes32);
        }
        console.log('Estimated tx gas:', estimatedTxGas);

        // add 10% to estimated gas left so that safe's funds were untouched
        uint extraGasRate = 10;
        estimatedTxGas = estimatedTxGas + estimatedTxGas / extraGasRate;
        console.log('Estimated tx gas (with added 10%):', estimatedTxGas);
        // subtract gas left from bounty reward
        bountyHunterReward -= estimatedTxGas;

        // get tx hash
        bytes32 txHash = safe.getTransactionHash(
            user3, // destination address
            bountyHunterReward, // ether value
            bytes(''), // data payload
            Enum.Operation.Call, // operation type
            safeTxGas, // gas that should be used for the safe transaction
            baseGas, // gas costs for data used to trigger the safe transaction
            gasPrice, // maximum gas price that should be used for this transaction
            address(0), // token address (or 0 if ETH) that is used for the payment
            gelatoRefundReceiver, // address of receiver of gas payment (or 0 if tx.origin)
            safe.nonce() // transaction nonce
        );
        // sign tx hash to get (r,s,v)
        (uint8 vUser1, bytes32 rUser1, bytes32 sUser1) = vm.sign(pkUser1, txHash);
        (uint8 vUser2, bytes32 rUser2, bytes32 sUser2) = vm.sign(pkUser2, txHash);
        
        // execute tx by gelator relayer
        vm.prank(gelatoRelayer);
        safe.execTransaction(
            user3, // destination address
            bountyHunterReward, // ether value
            bytes(''), // data payload 
            Enum.Operation.Call, // operation type
            safeTxGas, // gas that should be used for the safe transaction 
            baseGas, // gas costs for data used to trigger the safe transaction 
            gasPrice, // maximum gas price that should be used for this transaction
            address(0), // token address (or 0 if ETH) that is used for the payment
            payable(gelatoRefundReceiver), // address of receiver of gas payment (or 0 if tx.origin)
            abi.encodePacked(rUser2, sUser2, vUser2, rUser1, sUser1, vUser1) // packed signature data ({bytes32 r}{bytes32 s}{uint8 v})
        );

        console.log('===balances after===');
        console.log('Balance (user1):                 ', user1.balance);
        console.log('Balance (user2):                 ', user2.balance);
        console.log('Balance (user3):                 ', user3.balance);
        console.log('Balance (safe):                  ', address(safe).balance);
        console.log('Balance (gelato relayer):        ', address(gelatoRelayer).balance);
        console.log('Balance (gelato refund receiver):', address(gelatoRefundReceiver).balance);
    }

    function testSendDaiFromTwoOfTwoSafeViaRelayer() public {
        // init safe
        address[] memory owners = new address[](2);
        owners[0] = user1;
        owners[1] = user2;
        safe.setup(
            owners, // array of owners
            2, // number of required confirmations for a Safe transaction
            address(0), // contract address for optional delegate call
            bytes('0x00'), // data payload for optional delegate call
            address(0), // handler for fallback calls to this contract
            address(0), // token that should be used for the payment (0 is ETH)
            0, // value that should be paid
            payable(address(0)) // adddress that should receive the payment (or 0 if tx.origin)
        );

        // init DAI contract
        ERC20PresetFixedSupply daiContract = new ERC20PresetFixedSupply(
            'DAI', // name
            'DAI', // symbol
            100 ether, // initial supply
            user1 // owner
        );

        // user1 sends 100 DAI to safe
        vm.prank(user1);
        daiContract.transfer(address(safe), 100 ether);

        console.log('===balances before (DAI)===');
        console.log('Balance (user1):                 ', daiContract.balanceOf(user1));
        console.log('Balance (user2):                 ', daiContract.balanceOf(user2));
        console.log('Balance (user3):                 ', daiContract.balanceOf(user3));
        console.log('Balance (safe):                  ', daiContract.balanceOf(address(safe)));
        console.log('Balance (gelato relayer):        ', daiContract.balanceOf(gelatoRelayer));
        console.log('Balance (gelato refund receiver):', daiContract.balanceOf(gelatoRefundReceiver));
        
        // payment params to play with
        uint baseGas = 5000000000; // 5 gwei
        uint gasPrice = 1; // 1 wei, always smallet amount is used
        uint txFee = baseGas * gasPrice;
        uint bountyHunterReward = 100 ether - txFee;

        // prepare internal tx data
        bytes memory txData = abi.encodeWithSignature("transfer(address,uint256)", user3, bountyHunterReward);

        // estimate gas left before the relayer payout
        uint estimatedTxGas = 0;
        
        try safe.requiredTxGas(
            address(daiContract), 
            0, 
            txData, 
            Enum.Operation.Call
        ) returns (uint result) {
            // empty
        } catch Error(string memory reason) {
            bytes32 reasonBytes32;
            assembly {
                reasonBytes32 := mload(add(reason, 32))
            }
            estimatedTxGas = uint(reasonBytes32);
        }
        console.log('Estimated tx gas:', estimatedTxGas);

        // add 10% to estimated gas left so that safe's funds were untouched
        uint extraGasRate = 10;
        estimatedTxGas = estimatedTxGas + estimatedTxGas / extraGasRate;
        console.log('Estimated tx gas (with added 10%):', estimatedTxGas);
        // subtract gas left from bounty reward
        bountyHunterReward -= estimatedTxGas;
        
        // update tx data
        txData = abi.encodeWithSignature("transfer(address,uint256)", user3, bountyHunterReward);

        // get tx hash
        bytes32 txHash = safe.getTransactionHash(
            address(daiContract), // destination address
            0, // ether value
            txData, // data payload
            Enum.Operation.Call, // operation type
            estimatedTxGas, // gas that should be used for the internal safe transaction
            baseGas, // gas costs for data used to trigger the safe transaction
            gasPrice, // maximum gas price that should be used for this transaction
            address(daiContract), // token address (or 0 if ETH) that is used for the payment
            gelatoRefundReceiver, // address of receiver of gas payment (or 0 if tx.origin)
            safe.nonce() // transaction nonce
        );
        // sign tx hash to get (r,s,v)
        (uint8 vUser1, bytes32 rUser1, bytes32 sUser1) = vm.sign(pkUser1, txHash);
        (uint8 vUser2, bytes32 rUser2, bytes32 sUser2) = vm.sign(pkUser2, txHash);
        
        // execute tx by gelator relayer
        vm.prank(gelatoRelayer);
        safe.execTransaction(
            address(daiContract), // destination address
            0, // ether value
            txData, // data payload 
            Enum.Operation.Call, // operation type
            estimatedTxGas, // gas that should be used for the internal safe transaction 
            baseGas, // gas costs for data used to trigger the safe transaction 
            gasPrice, // maximum gas price that should be used for this transaction
            address(daiContract), // token address (or 0 if ETH) that is used for the payment
            payable(gelatoRefundReceiver), // address of receiver of gas payment (or 0 if tx.origin)
            abi.encodePacked(rUser2, sUser2, vUser2, rUser1, sUser1, vUser1) // packed signature data ({bytes32 r}{bytes32 s}{uint8 v})
        );

        console.log('===balances after (DAI)===');
        console.log('Balance (user1):                 ', daiContract.balanceOf(user1));
        console.log('Balance (user2):                 ', daiContract.balanceOf(user2));
        console.log('Balance (user3):                 ', daiContract.balanceOf(user3));
        console.log('Balance (safe):                  ', daiContract.balanceOf(address(safe)));
        console.log('Balance (gelato relayer):        ', daiContract.balanceOf(gelatoRelayer));
        console.log('Balance (gelato refund receiver):', daiContract.balanceOf(gelatoRefundReceiver));

        /**
         * How to execute tx on the frontend:
         * 1. Calculate gelato tx fee in DAI via "relay.getEstimatedFee()"
         * 2. Calculate internal tx gas cost via "safe.requiredTxGas()"
         * 3. Add 10% rate to estimate internal tx cost (optional?)
         * 4. Recalculate bounty hunter reward. Reward = reward - gelato fee - internal tx fee(optional?)
         * 5. Execute tx.  estimatedTxGas => safe.requiredTxGas() + 10%, base gas + gas price = gelato fee
         *
         * TOCHECK:
         * - perhaps "relay.getEstimatedFee" already includes "safe.requiredTxGas()", try "safeTxGas = 0"
         * - perhaps we don't need to add 10% on step3
         * - perhaps we don't need to subtract "internal tx fee" on step 4
         */
    }
}
