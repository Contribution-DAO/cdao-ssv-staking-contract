// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "../interfaces/ssv-network/ISSVClusters.sol";

/// @dev 256 bit struct
/// @member basisPoints basis points (percent * 100) of EL rewards that should go to the recipient
/// @member recipient address of the recipient
struct FeeRecipient {
    uint96 basisPoints;
    address payable recipient;
}

/// @member pubkey The public key of the new validator
/// @member sharesData Encrypted shares related to the new validator
struct SsvValidator {
    bytes pubkey;
    bytes sharesData;
}

/// @member signatures BLS12-381 signatures
/// @member depositDataRoots SHA-256 hashes of the SSZ-encoded DepositData objects
struct DepositData {
    bytes[] signatures;
    bytes32[] depositDataRoots;
}

/// @dev Data from https://github.com/bloxapp/ssv-network/blob/8c945e82cc063eb8e40c467d314a470121821157/contracts/interfaces/ISSVNetworkCore.sol#L20
/// @member owner SSV operator owner
/// @member id SSV operator ID
/// @member snapshot SSV operator snapshot (should be retrieved from SSVNetwork storage)
/// @member fee SSV operator fee
struct SsvOperator {
    address owner;
    uint64 id;
    bytes32 snapshot;
    uint256 fee;
}

/// @member ssvOperators SSV operators for the cluster
/// @member ssvValidators new SSV validators to be registered in the cluster
/// @member cluster SSV cluster
/// @member tokenAmount amount of ERC-20 SSV tokens for validator registration
/// @member ssvSlot0 Slot # (uint256(keccak256("ssv.network.storage.protocol")) - 1) from SSVNetwork
struct SsvPayload {
    SsvOperator[] ssvOperators;
    SsvValidator[] ssvValidators;
    ISSVNetworkCore.Cluster cluster;
    uint256 tokenAmount;
    bytes32 ssvSlot0;
}

/// @member depositId ID of the deposit
/// @member operator address of the operator
/// @member feeManagerInstance address of the FeeManager instance
/// @member ssvProxy address of the SSVProxy instance
/// @member ethAmount amount of ETH deposited
/// @member blockNumber block number of the deposit
struct AddEthData {
    bytes32 depositId;
    address operator;
    address feeManagerInstance;
    address ssvProxy;
    uint256 ethAmount;
    uint256 blockNumber;
}

/// @dev status of the client deposit
/// @member None default status indicating that no ETH is waiting to be forwarded to Beacon DepositContract
/// @member EthAdded client added ETH
/// @member BeaconDepositInProgress Service has forwarded some (but not all) ETH to Beacon DepositContract
/// If all ETH has been forwarded, the status will be None.
/// @member ServiceRejected Service has rejected the service for a given FeeManager instance
// The client can get a refund immediately.
enum ClientDepositStatus {
    None,
    EthAdded,
    BeaconDepositInProgress,
    ServiceRejected
}

/// @dev 256 bit struct
/// @member ethDepositOperator address of the operator
/// @member amount ETH in wei to be used for an ETH Deposit deposit corresponding to a particular FeeManager instance
/// @member expiration block timestamp after which the client will be able to get a refund
/// @member status deposit status
/// @member ethAmountPerValidatorInWei amount of ETH to deposit per 1 validator (should be >= 32 and <= 2048)
struct ClientDeposit {
    address ethDepositOperator;
    uint112 amount;
    uint40 expiration;
    ClientDepositStatus status;
    uint96 ethAmountPerValidatorInWei;
}
